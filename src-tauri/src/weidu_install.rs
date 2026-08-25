//! WeiDU process spawning, listing, staging, and cleanup.

use crate::mod_fs::{find_subdir_ci, validate_folder_name};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const INSTALL_EVENT: &str = "weidu-install-event";
const STAGE_PROGRESS_EVENT: &str = "weidu-stage-progress";
const DEFAULT_TIMEOUT_SECS: u64 = 3600;

pub struct RunningWeidu {
    pub child: Mutex<Option<std::process::Child>>,
    pub cancel: Arc<AtomicBool>,
}

impl RunningWeidu {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn clear_cancel(&self) {
        self.cancel.store(false, Ordering::SeqCst);
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    let opt = Option::<T>::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeiduComponentInfo {
    pub index: i32,
    pub number: i32,
    pub name: String,
    /// WeiDU may emit `"label": null` when a component has no LABEL flags.
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub label: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeiduLanguageInfo {
    pub index: i32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStepInput {
    pub weidu_path: String,
    pub tp2_path: String,
    pub game_dir: String,
    pub bg1_dir: Option<String>,
    pub component_id: String,
    pub component_number: i32,
    pub language_index: i32,
    pub step_id: String,
    pub log_dir: String,
    pub step_folder: String,
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub exit_code: Option<i32>,
    pub stdout_path: String,
    pub stderr_path: String,
    pub debug_path: Option<String>,
    pub log_verified: bool,
    pub timed_out: bool,
    pub cancelled: bool,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageProgress {
    pub phase: String,
    pub message: String,
    pub files_done: u64,
    pub bytes_done: u64,
}

fn emit_stage_progress(app: &AppHandle, payload: StageProgress) {
    let _ = app.emit(STAGE_PROGRESS_EVENT, &payload);
}

fn copy_recursive_with_progress(
    app: &AppHandle,
    from: &Path,
    to: &Path,
    files: &Arc<AtomicU64>,
    bytes: &Arc<AtomicU64>,
) -> Result<(), String> {
    if from.is_dir() {
        fs::create_dir_all(to).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_recursive_with_progress(
                app,
                &entry.path(),
                &to.join(entry.file_name()),
                files,
                bytes,
            )?;
        }
    } else {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let meta = from.metadata().map_err(|e| e.to_string())?;
        fs::copy(from, to).map_err(|e| e.to_string())?;
        let name = from
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let fd = files.fetch_add(1, Ordering::SeqCst) + 1;
        let bd = bytes.fetch_add(meta.len(), Ordering::SeqCst) + meta.len();
        emit_stage_progress(
            app,
            StageProgress {
                phase: "copy".into(),
                message: name,
                files_done: fd,
                bytes_done: bd,
            },
        );
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum InstallEventPayload {
    Output {
        stream: String,
        text: String,
    },
    Classified {
        level: String,
        message: String,
    },
    InputRequired {
        prompt: String,
    },
    StepStarted {
        step_id: String,
    },
    StepFinished {
        step_id: String,
        success: bool,
        exit_code: Option<i32>,
    },
    /// Full command line about to run (exe + args); no process output.
    CommandLogged {
        command: String,
    },
}

fn emit_event(app: &AppHandle, payload: InstallEventPayload) {
    let _ = app.emit(INSTALL_EVENT, &payload);
}

fn format_weidu_command(exe: &Path, cwd: &Path, args: &[String]) -> String {
    fn quote_arg(s: &str) -> String {
        if s.is_empty() || s.chars().any(|c| c.is_whitespace() || c == '"') {
            format!("\"{}\"", s.replace('"', "\\\""))
        } else {
            s.to_string()
        }
    }
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(quote_arg(&exe.to_string_lossy()));
    for a in args {
        parts.push(quote_arg(a));
    }
    format!("[{}] {}", cwd.to_string_lossy(), parts.join(" "))
}

fn emit_command_logged(app: &AppHandle, exe: &Path, cwd: &Path, args: &[String]) {
    emit_event(
        app,
        InstallEventPayload::CommandLogged {
            command: format_weidu_command(exe, cwd, args),
        },
    );
}

fn emit_classified_error(app: &AppHandle, message: &str) {
    emit_event(
        app,
        InstallEventPayload::Classified {
            level: "error".into(),
            message: message.to_string(),
        },
    );
}

fn validate_weidu_path(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path.trim());
    if p.as_os_str().is_empty() {
        return Err("WeiDU executable path is not set".into());
    }
    if !p.is_file() {
        return Err(format!("WeiDU executable not found: {}", p.display()));
    }
    Ok(p)
}

/// Strip Windows `\\?\` verbatim prefix so canonicalize'd paths strip_prefix cleanly.
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

/// WeiDU TRA / %MOD_FOLDER% resolve relative to the parent of the folder that
/// contains the tp2 (e.g. cwd=`…/A7-DlcMerger`, tp2=`DlcMerger/DlcMerger.tp2`),
/// not always the game root. Nested download layouts need that parent cwd.
/// `game_dir` is still required so we refuse tp2 paths outside the game tree.
fn weidu_game_cwd_and_tp2_arg(game_dir: &Path, tp2: &Path) -> Result<(PathBuf, String), String> {
    let game = PathBuf::from(game_dir);
    if !game.is_dir() {
        return Err(format!("Game directory not found: {}", game.display()));
    }
    if !tp2.is_file() {
        return Err(format!("TP2 not found: {}", tp2.display()));
    }

    let game_canon =
        fs::canonicalize(&game).map_err(|e| format!("Cannot resolve game directory: {e}"))?;
    let tp2_canon = fs::canonicalize(tp2).map_err(|e| format!("Cannot resolve TP2 path: {e}"))?;
    let game_clean = strip_verbatim_prefix(&game_canon);
    let tp2_clean = strip_verbatim_prefix(&tp2_canon);

    if !tp2_clean.starts_with(&game_clean) {
        return Err(format!(
            "TP2 is not under game directory (tp2={}, game={})",
            tp2.display(),
            game.display()
        ));
    }

    let mod_folder = tp2_clean
        .parent()
        .ok_or_else(|| format!("TP2 has no parent directory: {}", tp2.display()))?;
    // Parent of the folder that contains the tp2. For `game/MyMod/setup.tp2` that is
    // the game dir; for `game/A7-DlcMerger/DlcMerger/DlcMerger.tp2` it is A7-DlcMerger
    // (required so LANGUAGE paths like `DlcMerger/languages/...` resolve).
    let cwd_clean = mod_folder
        .parent()
        .filter(|p| *p == game_clean.as_path() || p.starts_with(&game_clean))
        .unwrap_or(game_clean.as_path());

    let rel = tp2_clean.strip_prefix(cwd_clean).map_err(|_| {
        format!(
            "TP2 is not under WeiDU cwd (tp2={}, cwd={})",
            tp2.display(),
            cwd_clean.display()
        )
    })?;
    let tp2_arg = rel.to_string_lossy().replace('\\', "/");
    if tp2_arg.is_empty() || tp2_arg.split('/').any(|p| p == "..") {
        return Err("Invalid relative TP2 path".into());
    }

    // Prefer the non-verbatim path for process cwd (WeiDU is picky on Windows).
    let cwd = if cwd_clean == game_clean.as_path() {
        game
    } else {
        let rel_cwd = cwd_clean
            .strip_prefix(&game_clean)
            .map(|p| game.join(p))
            .unwrap_or_else(|_| cwd_clean.to_path_buf());
        rel_cwd
    };

    Ok((cwd, tp2_arg))
}

fn run_weidu_capture(
    app: &AppHandle,
    weidu: &Path,
    cwd: &Path,
    args: &[String],
) -> Result<String, String> {
    emit_command_logged(app, weidu, cwd, args);
    let output = Command::new(weidu)
        .current_dir(cwd)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let combined = if !stdout.trim().is_empty() {
        let stderr_trim = stderr.trim();
        if stderr_trim.is_empty() || stdout.trim() == stderr_trim || stdout.contains(stderr_trim) {
            stdout
        } else {
            format!("{stdout}\n{stderr}")
        }
    } else {
        stderr
    };
    if !output.status.success() && combined.trim().is_empty() {
        return Err(format!(
            "WeiDU exited with status {} without output",
            output.status
        ));
    }
    Ok(combined)
}

/// Find the closing `]` matching `text[start]` (`[`), ignoring brackets inside JSON strings.
fn find_matching_array_end(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    if start >= bytes.len() || bytes[start] != b'[' {
        return None;
    }
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    for (idx, &b) in bytes.iter().enumerate().skip(start) {
        if in_string {
            if escape {
                escape = false;
            } else if b == b'\\' {
                escape = true;
            } else if b == b'"' {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(idx);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_json_array<T: for<'de> Deserialize<'de>>(text: &str) -> Result<Vec<T>, String> {
    // Do not use bare find('[') — WeiDU banners look like `[D:\path\weidu.exe] version …`.
    let bytes = text.as_bytes();
    let mut last_err: Option<String> = None;
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'[' {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            // Real JSON arrays start with `{`, `"`, or `]` (empty). Path banners start with a drive letter.
            if j < bytes.len() && matches!(bytes[j], b'{' | b'"' | b']') {
                if let Some(end) = find_matching_array_end(text, i) {
                    let slice = &text[i..=end];
                    match serde_json::from_str::<Vec<T>>(slice) {
                        Ok(v) => return Ok(v),
                        Err(e) => last_err = Some(format!("Invalid JSON: {e}")),
                    }
                }
            }
        }
        i += 1;
    }
    Err(last_err.unwrap_or_else(|| "No JSON array in WeiDU output".into()))
}

#[tauri::command]
pub fn list_weidu_components(
    app: AppHandle,
    weidu_path: String,
    tp2_path: String,
    game_dir: String,
    lang: i32,
) -> Result<Vec<WeiduComponentInfo>, String> {
    let weidu = validate_weidu_path(&weidu_path)?;
    let tp2 = PathBuf::from(tp2_path.trim());
    let (cwd, tp2_arg) = weidu_game_cwd_and_tp2_arg(Path::new(game_dir.trim()), &tp2)?;
    let args = vec![
        "--nogame".into(),
        "--noautoupdate".into(),
        "--list-components-json".into(),
        tp2_arg,
        lang.to_string(),
    ];
    let out = match run_weidu_capture(&app, &weidu, &cwd, &args) {
        Ok(text) => text,
        Err(e) => {
            emit_classified_error(&app, &e);
            return Err(e);
        }
    };
    // Probe stdout is used only for parsing — do not mirror into the WeiDU/Results console.
    parse_json_array(&out).map_err(|e| {
        emit_classified_error(&app, &e);
        e
    })
}

fn parse_languages_output(text: &str) -> Result<Vec<WeiduLanguageInfo>, String> {
    if let Ok(list) = parse_json_array::<WeiduLanguageInfo>(text) {
        if !list.is_empty() {
            return Ok(list);
        }
    }
    if let Ok(raw) = parse_json_array::<serde_json::Value>(text) {
        let mut out = Vec::new();
        for (i, v) in raw.iter().enumerate() {
            if let Some(s) = v.as_str() {
                out.push(WeiduLanguageInfo {
                    index: i as i32,
                    name: s.to_string(),
                });
            } else if let (Some(idx), Some(name)) = (
                v.get("index").and_then(|x| x.as_i64()),
                v.get("name").and_then(|x| x.as_str()),
            ) {
                out.push(WeiduLanguageInfo {
                    index: idx as i32,
                    name: name.to_string(),
                });
            }
        }
        if !out.is_empty() {
            return Ok(out);
        }
    }
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((idx, name)) = line.split_once(':') {
            if let Ok(index) = idx.trim().parse::<i32>() {
                out.push(WeiduLanguageInfo {
                    index,
                    name: name.trim().to_string(),
                });
                continue;
            }
        }
        out.push(WeiduLanguageInfo {
            index: out.len() as i32,
            name: line.to_string(),
        });
    }
    if out.is_empty() {
        return Err("No languages found in WeiDU output".into());
    }
    Ok(out)
}

#[tauri::command]
pub fn list_weidu_languages(
    app: AppHandle,
    weidu_path: String,
    tp2_path: String,
    game_dir: String,
) -> Result<Vec<WeiduLanguageInfo>, String> {
    let weidu = validate_weidu_path(&weidu_path)?;
    let tp2 = PathBuf::from(tp2_path.trim());
    let (cwd, tp2_arg) = weidu_game_cwd_and_tp2_arg(Path::new(game_dir.trim()), &tp2)?;
    let args = vec![
        "--nogame".into(),
        "--noautoupdate".into(),
        "--list-languages".into(),
        tp2_arg,
    ];
    let out = match run_weidu_capture(&app, &weidu, &cwd, &args) {
        Ok(text) => text,
        Err(e) => {
            emit_classified_error(&app, &e);
            return Err(e);
        }
    };
    // Probe stdout is used only for parsing — do not mirror into the WeiDU/Results console.
    parse_languages_output(&out).map_err(|e| {
        emit_classified_error(&app, &e);
        e
    })
}

fn classify_line(line: &str) -> Option<&'static str> {
    let lower = line.trim().to_lowercase();
    if lower.is_empty() {
        return None;
    }
    const CHOICE_PHRASES: &[&str] = &[
        "do you want",
        "would you like",
        "please enter",
        "please choose",
        "please select",
        "select your language",
        "choose your language",
        "choose one of the following",
        "press any key",
    ];
    for p in CHOICE_PHRASES {
        if lower.contains(p) {
            return Some("inputRequired");
        }
    }
    const ERROR_PHRASES: &[&str] = &[
        "not installed due to errors",
        "stopping installation because of error",
        "error installing",
        "failed to install",
        "error:",
    ];
    for p in ERROR_PHRASES {
        if lower.contains(p) {
            return Some("error");
        }
    }
    const WARNING_PHRASES: &[&str] = &[
        "installed with warnings",
        "warning:",
        "continuing despite error",
    ];
    for p in WARNING_PHRASES {
        if lower.contains(p) {
            return Some("warning");
        }
    }
    const FINISHED_PHRASES: &[&str] = &[
        "successfully installed",
        "installation complete",
        "installed successfully",
    ];
    for p in FINISHED_PHRASES {
        if lower.contains(p) {
            return Some("finished");
        }
    }
    None
}

fn append_file(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

/// `{NNN}-{safeMod}-{safeComponent}` → `{safeMod}-{safeComponent}` for stream filenames.
fn stream_stem_from_folder(step_folder: &str) -> String {
    let trimmed = step_folder.trim();
    match trimmed.split_once('-') {
        Some((_, rest)) if !rest.is_empty() => rest.to_string(),
        _ => {
            if trimmed.is_empty() {
                "step".into()
            } else {
                trimmed.to_string()
            }
        }
    }
}

fn step_stream_paths(step_dir: &Path, step_folder: &str) -> (PathBuf, PathBuf) {
    let stem = stream_stem_from_folder(step_folder);
    (
        step_dir.join(format!("{stem}-mod.log")),
        step_dir.join(format!("{stem}-component.log")),
    )
}

fn find_debug_file(tp2: &Path) -> Option<PathBuf> {
    let search_dir = tp2.parent()?;
    let entries = fs::read_dir(search_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name.ends_with(".debug") && name.contains("setup") {
            return Some(path);
        }
    }
    None
}

fn verify_weidu_log(game_dir: &Path, tp2: &Path, lang: i32, number: i32) -> bool {
    let log_path = game_dir.join("weidu.log");
    let Ok(text) = fs::read_to_string(&log_path) else {
        return false;
    };
    let tp2_norm = tp2
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    let tp2_name = tp2
        .file_name()
        .map(|s| s.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let Ok(re) = Regex::new(r"(?i)^~([^~]+)~ #(\d+) #(\d+)") else {
        return false;
    };
    for line in text.lines() {
        let Some(caps) = re.captures(line.trim()) else {
            continue;
        };
        let path = caps
            .get(1)
            .map(|m| m.as_str().replace('\\', "/").to_ascii_lowercase())
            .unwrap_or_default();
        let lang_idx: i32 = caps
            .get(2)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(-1);
        let num: i32 = caps
            .get(3)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(-1);
        if lang_idx != lang {
            continue;
        }
        if !(path == tp2_norm || path.ends_with(&tp2_name) || tp2_norm.ends_with(&path)) {
            continue;
        }
        if num == number {
            return true;
        }
    }
    false
}

fn stream_pipe(
    reader: impl BufRead + Send + 'static,
    stream: &'static str,
    step_log: PathBuf,
    run_log: PathBuf,
    cancel: Arc<AtomicBool>,
    app: AppHandle,
) {
    thread::spawn(move || {
        for line in reader.lines().flatten() {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            let nl = format!("{line}\n");
            let _ = append_file(&step_log, &nl);
            let _ = append_file(&run_log, &nl);
            emit_event(
                &app,
                InstallEventPayload::Output {
                    stream: stream.into(),
                    text: line.clone(),
                },
            );
            // Only surface interactive prompts here. Error/warning highlighting comes from
            // raw Output in the UI (WeiDU + Results tabs); do not emit Classified for those.
            if classify_line(&line) == Some("inputRequired") {
                emit_event(
                    &app,
                    InstallEventPayload::InputRequired {
                        prompt: line.clone(),
                    },
                );
            }
        }
    });
}

/// WeiDU mod id = folder that contains the tp2 → `setup-{weiduId}.exe` in the game dir.
fn setup_exe_for_tp2(game_dir: &Path, tp2: &Path) -> Result<(String, PathBuf), String> {
    let weidu_id = tp2
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Cannot derive WeiDU id from tp2: {}", tp2.display()))?;
    validate_folder_name(&weidu_id)?;
    let setup_name = format!("setup-{weidu_id}.exe");
    Ok((weidu_id, game_dir.join(&setup_name)))
}

/// Single edit point for WeiDU install command exceptions.
/// Key is exact InstallSequence component id (e.g. "EET:0").
fn weidu_install_exception_args(input: &RunStepInput, game_dir: &Path) -> Option<Vec<String>> {
    let bg1_arg = input
        .bg1_dir
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| p.to_string())
        .unwrap_or_else(|| game_dir.to_string_lossy().into_owned());
    match input.component_id.as_str() {
        "EET:0" => Some(vec!["--args-list".into(), "sp".into(), bg1_arg]),
        _ => None,
    }
}

#[tauri::command]
pub async fn run_weidu_step(
    app: AppHandle,
    state: State<'_, RunningWeidu>,
    input: RunStepInput,
) -> Result<StepResult, String> {
    state.clear_cancel();
    let weidu = validate_weidu_path(&input.weidu_path)?;
    let tp2 = PathBuf::from(input.tp2_path.trim());
    let game_dir = PathBuf::from(input.game_dir.trim());
    if !tp2.is_file() {
        return Err(format!("TP2 not found: {}", tp2.display()));
    }
    if !game_dir.is_dir() {
        return Err(format!("Game directory not found: {}", game_dir.display()));
    }

    let log_dir = PathBuf::from(input.log_dir.trim());
    let step_dir = log_dir.join(&input.step_folder);
    fs::create_dir_all(&step_dir).map_err(|e| e.to_string())?;
    let (stdout_path, stderr_path) = step_stream_paths(&step_dir, &input.step_folder);
    let run_stdout = log_dir.join("run-stdout.log");
    let run_stderr = log_dir.join("run-stderr.log");

    let (cwd, _tp2_arg) = weidu_game_cwd_and_tp2_arg(&game_dir, &tp2)?;
    let (weidu_id, setup_exe) = setup_exe_for_tp2(&game_dir, &tp2)?;
    fs::copy(&weidu, &setup_exe)
        .map_err(|e| format!("Failed to copy WeiDU to setup-{weidu_id}.exe: {e}"))?;

    // setup-{weiduId}.exe auto-binds the tp2; do not pass the tp2 path as argv.
    // --language = mod TRA; --use-lang = EE game lang/ folder (avoids weidu.conf prompt).
    // --no-exit-pause / --skip-at-view avoid interactive pauses during automated installs.
    let mut args: Vec<String> = vec![
        "--noautoupdate".into(),
        "--no-exit-pause".into(),
        "--skip-at-view".into(),
        "--language".into(),
        input.language_index.to_string(),
        "--use-lang".into(),
        "en_US".into(),
        "--force-install".into(),
        input.component_number.to_string(),
    ];
    if let Some(extra_args) = weidu_install_exception_args(&input, &game_dir) {
        emit_event(
            &app,
            InstallEventPayload::Classified {
                level: "info".into(),
                message: format!(
                    "Applying WeiDU install exception for {}",
                    input.component_id
                ),
            },
        );
        args.extend(extra_args);
    }

    emit_event(
        &app,
        InstallEventPayload::StepStarted {
            step_id: input.step_id.clone(),
        },
    );

    emit_command_logged(&app, &setup_exe, &cwd, &args);

    let timeout = Duration::from_secs(input.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));
    let cancel = Arc::clone(&state.cancel);

    let mut child = Command::new(&setup_exe)
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(out) = child.stdout.take() {
        stream_pipe(
            BufReader::new(out),
            "stdout",
            stdout_path.clone(),
            run_stdout.clone(),
            Arc::clone(&cancel),
            app.clone(),
        );
    }
    if let Some(err) = child.stderr.take() {
        stream_pipe(
            BufReader::new(err),
            "stderr",
            stderr_path.clone(),
            run_stderr.clone(),
            Arc::clone(&cancel),
            app.clone(),
        );
    }

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    let start = Instant::now();
    let mut timed_out = false;
    let mut cancelled = false;
    loop {
        if cancel.load(Ordering::SeqCst) {
            cancelled = true;
            state.request_cancel();
            break;
        }
        let done = {
            let mut guard = state.child.lock().map_err(|e| e.to_string())?;
            if let Some(ref mut c) = guard.as_mut() {
                match c.try_wait() {
                    Ok(Some(_)) => true,
                    Ok(None) => false,
                    Err(e) => return Err(e.to_string()),
                }
            } else {
                true
            }
        };
        if done {
            break;
        }
        if start.elapsed() > timeout {
            timed_out = true;
            state.request_cancel();
            break;
        }
        thread::sleep(Duration::from_millis(200));
    }

    let exit_code = {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(mut c) = guard.take() {
            c.wait().ok().and_then(|s| s.code())
        } else {
            None
        }
    };
    let duration_ms = start.elapsed().as_millis() as u64;

    let debug_src = find_debug_file(&tp2);
    let debug_path = debug_src.as_ref().map(|src| {
        let dest = step_dir.join(src.file_name().unwrap_or_default());
        let _ = fs::copy(src, &dest);
        dest.to_string_lossy().into_owned()
    });

    let log_verified = verify_weidu_log(
        &game_dir,
        &tp2,
        input.language_index,
        input.component_number,
    );
    // 0 = success, 3 = installed with warnings (non-breaking). Exact status is refined in TS.
    let success = !timed_out && !cancelled && matches!(exit_code, Some(0) | Some(3));

    emit_event(
        &app,
        InstallEventPayload::StepFinished {
            step_id: input.step_id.clone(),
            success,
            exit_code,
        },
    );

    Ok(StepResult {
        exit_code,
        stdout_path: stdout_path.to_string_lossy().into_owned(),
        stderr_path: stderr_path.to_string_lossy().into_owned(),
        debug_path,
        log_verified,
        timed_out,
        cancelled,
        duration_ms,
    })
}

#[tauri::command]
pub fn send_weidu_stdin(state: State<'_, RunningWeidu>, text: String) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    let child = guard.as_mut().ok_or("No WeiDU process running")?;
    let stdin = child.stdin.as_mut().ok_or("WeiDU stdin not available")?;
    let line = if text.ends_with('\n') {
        text
    } else {
        format!("{text}\n")
    };
    stdin
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_weidu_step(state: State<'_, RunningWeidu>) {
    state.request_cancel();
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceUninstallInput {
    pub weidu_path: String,
    pub tp2_path: String,
    pub game_dir: String,
    pub component_number: i32,
    pub language_index: i32,
    pub log_dir: String,
    pub step_folder: String,
}

/// Same launcher as install: copy weidu → `setup-{weiduId}.exe`, run that exe (no tp2 argv)
/// with `--force-uninstall` to roll back a component.
#[tauri::command]
pub async fn run_weidu_force_uninstall(
    app: AppHandle,
    input: ForceUninstallInput,
) -> Result<(), String> {
    let weidu = validate_weidu_path(&input.weidu_path)?;
    let tp2 = PathBuf::from(input.tp2_path.trim());
    let game_dir = PathBuf::from(input.game_dir.trim());
    if !tp2.is_file() {
        return Err(format!("TP2 not found: {}", tp2.display()));
    }
    if !game_dir.is_dir() {
        return Err(format!("Game directory not found: {}", game_dir.display()));
    }

    let log_dir = PathBuf::from(input.log_dir.trim());
    let step_dir = log_dir.join(input.step_folder.trim());
    fs::create_dir_all(&step_dir).map_err(|e| e.to_string())?;
    let (stdout_path, stderr_path) = step_stream_paths(&step_dir, &input.step_folder);
    let run_stdout = log_dir.join("run-stdout.log");
    let run_stderr = log_dir.join("run-stderr.log");

    let (cwd, _tp2_arg) = weidu_game_cwd_and_tp2_arg(&game_dir, &tp2)?;
    let (weidu_id, setup_exe) = setup_exe_for_tp2(&game_dir, &tp2)?;
    fs::copy(&weidu, &setup_exe)
        .map_err(|e| format!("Failed to copy WeiDU to setup-{weidu_id}.exe: {e}"))?;

    let args: Vec<String> = vec![
        "--noautoupdate".into(),
        "--language".into(),
        input.language_index.to_string(),
        "--use-lang".into(),
        "en_US".into(),
        "--force-uninstall".into(),
        input.component_number.to_string(),
    ];

    emit_command_logged(&app, &setup_exe, &cwd, &args);

    let cancel = Arc::new(AtomicBool::new(false));

    let mut child = Command::new(&setup_exe)
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(out) = child.stdout.take() {
        stream_pipe(
            BufReader::new(out),
            "stdout",
            stdout_path.clone(),
            run_stdout.clone(),
            Arc::clone(&cancel),
            app.clone(),
        );
    }
    if let Some(err) = child.stderr.take() {
        stream_pipe(
            BufReader::new(err),
            "stderr",
            stderr_path.clone(),
            run_stderr.clone(),
            Arc::clone(&cancel),
            app.clone(),
        );
    }

    let status = child.wait().map_err(|e| e.to_string())?;

    if !status.success() {
        return Err(format!(
            "Force uninstall exited with status {}",
            status
                .code()
                .map(|c| c.to_string())
                .unwrap_or_else(|| "unknown".into())
        ));
    }
    Ok(())
}

fn find_tp2_in_dir(dir: &Path) -> Result<PathBuf, String> {
    let candidates = collect_tp2_candidates(dir)?;
    pick_tp2_candidate(candidates, None, None)
}

fn collect_tp2_candidates(dir: &Path) -> Result<Vec<PathBuf>, String> {
    fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) -> Result<(), String> {
        if depth > 8 {
            return Ok(());
        }
        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                walk(&path, depth + 1, out)?;
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if name.ends_with(".tp2") {
                out.push(path);
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(dir, 0, &mut out)?;
    if out.is_empty() {
        return Err(format!("No .tp2 found under {}", dir.display()));
    }
    Ok(out)
}

fn path_has_segment(path: &Path, segment: &str) -> bool {
    let target = segment.to_ascii_lowercase();
    path.components()
        .any(|c| c.as_os_str().to_string_lossy().to_ascii_lowercase() == target)
}

fn windows_engine_folder_from_version(version: &str) -> Option<String> {
    let parts: Vec<&str> = version
        .trim()
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() >= 2 {
        Some(format!("windows-engine-v{}.{}", parts[0], parts[1]))
    } else {
        None
    }
}

fn parse_windows_engine_rank(path: &Path) -> Option<(u32, u32)> {
    for c in path.components() {
        let name = c.as_os_str().to_string_lossy().to_ascii_lowercase();
        let Some(rest) = name.strip_prefix("windows-engine-v") else {
            continue;
        };
        let mut parts = rest.split('.');
        let major = parts.next()?.parse().ok()?;
        let minor = parts.next()?.parse().ok()?;
        return Some((major, minor));
    }
    None
}

fn pick_bubb_pathfinding_candidates(
    candidates: Vec<PathBuf>,
    game_version: Option<&str>,
) -> Vec<PathBuf> {
    let bubb: Vec<PathBuf> = candidates
        .iter()
        .filter(|p| path_has_segment(p, "bubb_revert_pathfinding"))
        .cloned()
        .collect();
    let pool = if bubb.is_empty() { candidates } else { bubb };

    if let Some(folder) = game_version.and_then(windows_engine_folder_from_version) {
        let matched: Vec<PathBuf> = pool
            .iter()
            .filter(|p| path_has_segment(p, &folder))
            .cloned()
            .collect();
        if !matched.is_empty() {
            return matched;
        }
    }

    // Fall back to highest windows-engine-v* present.
    let mut ranked: Vec<(u32, u32, PathBuf)> = pool
        .iter()
        .filter_map(|p| parse_windows_engine_rank(p).map(|(maj, min)| (maj, min, p.clone())))
        .collect();
    if ranked.is_empty() {
        return pool;
    }
    ranked.sort_by(|a, b| (b.0, b.1).cmp(&(a.0, a.1)));
    let (best_maj, best_min, _) = ranked[0];
    ranked
        .into_iter()
        .filter(|(maj, min, _)| *maj == best_maj && *min == best_min)
        .map(|(_, _, p)| p)
        .collect()
}

fn pick_tp2_candidate(
    candidates: Vec<PathBuf>,
    tp2_hint: Option<&str>,
    game_version: Option<&str>,
) -> Result<PathBuf, String> {
    let mut pool = candidates;
    if let Some(hint) = tp2_hint.map(str::trim).filter(|h| !h.is_empty()) {
        let hinted: Vec<PathBuf> = pool
            .iter()
            .filter(|p| path_has_segment(p, hint))
            .cloned()
            .collect();
        if !hinted.is_empty() {
            pool = hinted;
        }
    }

    let hint_is_bubb = tp2_hint
        .map(|h| h.eq_ignore_ascii_case("bubb_revert_pathfinding"))
        .unwrap_or(false);
    if hint_is_bubb
        || pool
            .iter()
            .all(|p| path_has_segment(p, "bubb_revert_pathfinding"))
    {
        // Engine-folder picking is only for bubb_revert_pathfinding.
        pool = pick_bubb_pathfinding_candidates(pool, game_version);
    }

    // Prefer setup-*.tp2, then shallowest path, then lexical.
    pool.sort_by(|a, b| {
        let a_setup = a
            .file_name()
            .map(|n| {
                n.to_string_lossy()
                    .to_ascii_lowercase()
                    .starts_with("setup-")
            })
            .unwrap_or(false);
        let b_setup = b
            .file_name()
            .map(|n| {
                n.to_string_lossy()
                    .to_ascii_lowercase()
                    .starts_with("setup-")
            })
            .unwrap_or(false);
        b_setup
            .cmp(&a_setup)
            .then_with(|| a.components().count().cmp(&b.components().count()))
            .then_with(|| {
                a.to_string_lossy()
                    .to_ascii_lowercase()
                    .cmp(&b.to_string_lossy().to_ascii_lowercase())
            })
    });
    pool.into_iter()
        .next()
        .ok_or_else(|| "No .tp2 candidate remaining after filters".to_string())
}

#[tauri::command]
pub fn stage_mod_into_game_dir(
    app: AppHandle,
    mods_download_dir: String,
    codename: String,
    game_dir: String,
    tp2_hint: Option<String>,
    game_version: Option<String>,
) -> Result<String, String> {
    let codename = codename.trim();
    validate_folder_name(codename)?;
    let download = PathBuf::from(mods_download_dir.trim());
    if !download.is_dir() {
        return Err("Mods download directory does not exist".into());
    }
    let game = PathBuf::from(game_dir.trim());
    if game.as_os_str().is_empty() {
        return Err("Game directory is not set".into());
    }
    fs::create_dir_all(&game).map_err(|e| e.to_string())?;

    let source_name = find_subdir_ci(&download, codename)?
        .ok_or_else(|| format!("Mod folder \"{codename}\" not found in download directory"))?;
    let source_root = download.join(&source_name);
    let candidates = collect_tp2_candidates(&source_root)?;
    let tp2_in_source =
        pick_tp2_candidate(candidates, tp2_hint.as_deref(), game_version.as_deref())?;
    let mod_folder = tp2_in_source
        .parent()
        .ok_or_else(|| format!("TP2 has no parent directory: {}", tp2_in_source.display()))?;
    let staged_name = mod_folder
        .file_name()
        .ok_or_else(|| format!("Invalid mod folder name for {}", mod_folder.display()))?
        .to_string_lossy()
        .into_owned();
    validate_folder_name(&staged_name)?;

    let target = game.join(&staged_name);
    emit_stage_progress(
        &app,
        StageProgress {
            phase: "start".into(),
            message: format!("Copying {} → {}", mod_folder.display(), target.display()),
            files_done: 0,
            bytes_done: 0,
        },
    );

    if target.exists() {
        if target.is_dir() {
            fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
    }
    let files = Arc::new(AtomicU64::new(0));
    let bytes = Arc::new(AtomicU64::new(0));
    copy_recursive_with_progress(&app, mod_folder, &target, &files, &bytes)?;
    let tp2 = find_tp2_in_dir(&target)?;
    emit_stage_progress(
        &app,
        StageProgress {
            phase: "done".into(),
            message: format!("Staged {}", tp2.display()),
            files_done: files.load(Ordering::SeqCst),
            bytes_done: bytes.load(Ordering::SeqCst),
        },
    );
    Ok(tp2.to_string_lossy().into_owned())
}

pub(crate) fn find_named_game_exe(game: &Path, exe_name: &str) -> Option<PathBuf> {
    let trimmed = exe_name.trim();
    if trimmed.is_empty() {
        return None;
    }
    let p = game.join(trimmed);
    if p.is_file() {
        return Some(p);
    }
    // Case-insensitive fallback on Windows.
    let want = trimmed.to_ascii_lowercase();
    let Ok(entries) = fs::read_dir(game) else {
        return None;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name == want {
            return Some(entry.path());
        }
    }
    None
}

#[tauri::command]
pub fn read_game_exe_version(game_dir: String, exe_name: String) -> Result<String, String> {
    let game = PathBuf::from(game_dir.trim());
    if !game.is_dir() {
        return Err("Game directory does not exist".into());
    }
    let exe = find_named_game_exe(&game, &exe_name)
        .ok_or_else(|| format!("No {} found in game directory", exe_name.trim()))?;
    let exe_str = exe.to_string_lossy().replace('\'', "''");
    let script = format!("(Get-Item -LiteralPath '{exe_str}').VersionInfo.FileVersion");
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to read exe version: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to read exe version: {}", err.trim()));
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        return Err("Exe FileVersion was empty".into());
    }
    Ok(version)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupInput {
    pub game_dir: String,
    pub staged_folders: Vec<String>,
    #[serde(default)]
    pub keep_folders: Vec<String>,
    #[serde(default)]
    pub weidu_path: String,
    #[serde(default)]
    pub log_dir: String,
}

pub(crate) fn is_setup_exe_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.starts_with("setup-") && n.ends_with(".exe")
}

pub(crate) fn is_debug_file_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".debug")
}

#[tauri::command]
pub fn cleanup_install_artifacts(input: CleanupInput) -> Result<(), String> {
    let game = PathBuf::from(input.game_dir.trim());
    if !game.is_dir() {
        return Err(format!("Game folder not found: {}", game.display()));
    }

    for folder in &input.staged_folders {
        let name = folder.trim();
        if name.is_empty() {
            continue;
        }
        validate_folder_name(name)?;
        let path = game.join(name);
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        }
    }

    if let Ok(entries) = fs::read_dir(&game) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_setup_exe_name(&name) || is_debug_file_name(&name) {
                let _ = fs::remove_file(&path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_game_weidu_log(game_dir: String) -> Result<String, String> {
    let path = PathBuf::from(game_dir.trim()).join("weidu.log");
    if !path.is_file() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn setup_exe_name_from_tp2_parent() {
        let game = PathBuf::from(r"D:\games\bg\eet");
        let tp2 = game.join("cdtweaks").join("setup-cdtweaks.tp2");
        let (weidu_id, setup) = setup_exe_for_tp2(&game, &tp2).expect("setup path");
        assert_eq!(weidu_id, "cdtweaks");
        assert_eq!(setup, game.join("setup-cdtweaks.exe"));
    }

    #[test]
    fn weidu_component_label_null_deserializes() {
        let v = json!({
          "index": 0,
          "number": 4000,
          "name": "Adjust Evil Joinable NPC Reaction Rolls",
          "label": null
        });
        let info: WeiduComponentInfo = serde_json::from_value(v).expect("parse");
        assert_eq!(info.number, 4000);
        assert!(info.label.is_empty());
    }

    #[test]
    fn weidu_component_label_array_deserializes() {
        let v = json!({
          "index": 0,
          "number": 4000,
          "name": "Adjust Evil Joinable NPC Reaction Rolls",
          "label": ["cd_tweaks_adjust_evil_npc_reactions"]
        });
        let info: WeiduComponentInfo = serde_json::from_value(v).expect("parse");
        assert_eq!(info.label, vec!["cd_tweaks_adjust_evil_npc_reactions"]);
    }

    #[test]
    fn format_weidu_command_includes_cwd_and_args() {
        let exe = PathBuf::from(r"D:\dev\weidu.exe");
        let cwd = PathBuf::from(r"D:\games\bg\eet");
        let args = vec![
            "--nogame".into(),
            "--list-components-json".into(),
            r"cdtweaks\setup-cdtweaks.tp2".into(),
            "0".into(),
        ];
        let line = format_weidu_command(&exe, &cwd, &args);
        assert!(line.starts_with(r"[D:\games\bg\eet]"));
        assert!(line.contains(r"D:\dev\weidu.exe"));
        assert!(line.contains("--list-components-json"));
        assert!(line.contains("0"));
    }

    #[test]
    fn setup_exe_and_debug_name_matchers() {
        assert!(is_setup_exe_name("setup-cdtweaks.exe"));
        assert!(is_setup_exe_name("SETUP-FOO.EXE"));
        assert!(!is_setup_exe_name("weidu.exe"));
        assert!(!is_setup_exe_name("setup-cdtweaks.debug"));
        assert!(is_debug_file_name("setup-cdtweaks.debug"));
        assert!(is_debug_file_name("SETUP-FOO.DEBUG"));
        assert!(is_debug_file_name("other.debug"));
        assert!(!is_debug_file_name("weidu.log"));
    }

    #[test]
    fn cleanup_deletes_mod_folder_setup_exe_and_debug() {
        let dir = tempfile::tempdir().unwrap();
        let game = dir.path();
        fs::create_dir_all(game.join("cdtweaks")).unwrap();
        fs::write(game.join("cdtweaks").join("readme.txt"), b"x").unwrap();
        fs::write(game.join("setup-cdtweaks.exe"), b"x").unwrap();
        fs::write(game.join("SETUP-FOO.DEBUG"), b"x").unwrap();
        fs::write(game.join("weidu.log"), b"keep").unwrap();
        fs::write(game.join("other.txt"), b"keep").unwrap();

        cleanup_install_artifacts(CleanupInput {
            game_dir: game.to_string_lossy().into_owned(),
            staged_folders: vec!["cdtweaks".into()],
            keep_folders: vec![],
            weidu_path: String::new(),
            log_dir: String::new(),
        })
        .expect("cleanup");

        assert!(!game.join("cdtweaks").exists());
        assert!(!game.join("setup-cdtweaks.exe").exists());
        assert!(!game.join("SETUP-FOO.DEBUG").exists());
        assert!(game.join("weidu.log").is_file());
        assert!(game.join("other.txt").is_file());
    }
}
