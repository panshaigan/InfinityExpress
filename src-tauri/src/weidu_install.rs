//! WeiDU process spawning, listing, staging, and cleanup.

use crate::mod_fs::{copy_recursive, find_subdir_ci, validate_folder_name};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const INSTALL_EVENT: &str = "weidu-install-event";
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeiduComponentInfo {
  pub index: i32,
  pub number: i32,
  pub name: String,
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
  pub component_numbers: Vec<i32>,
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum InstallEventPayload {
  Output { stream: String, text: String },
  Classified { level: String, message: String },
  InputRequired { prompt: String },
  StepStarted { step_id: String },
  StepFinished {
    step_id: String,
    success: bool,
    exit_code: Option<i32>,
  },
}

fn emit_event(app: &AppHandle, payload: InstallEventPayload) {
  let _ = app.emit(INSTALL_EVENT, &payload);
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

fn tp2_working_dir(tp2: &Path) -> PathBuf {
  tp2.parent()
    .map(|p| p.to_path_buf())
    .unwrap_or_else(|| PathBuf::from("."))
}

fn tp2_arg_for_cwd(tp2: &Path, cwd: &Path) -> String {
  if let Ok(rel) = tp2.strip_prefix(cwd) {
    rel.to_string_lossy().into_owned()
  } else if let Some(name) = tp2.file_name() {
    name.to_string_lossy().into_owned()
  } else {
    tp2.to_string_lossy().into_owned()
  }
}

fn run_weidu_capture(weidu: &Path, cwd: &Path, args: &[String]) -> Result<String, String> {
  let output = Command::new(weidu)
    .current_dir(cwd)
    .args(args)
    .output()
    .map_err(|e| e.to_string())?;
  let mut combined = String::new();
  combined.push_str(&String::from_utf8_lossy(&output.stdout));
  if !output.stderr.is_empty() {
    if !combined.is_empty() {
      combined.push('\n');
    }
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
  }
  if !output.status.success() && combined.trim().is_empty() {
    return Err(format!(
      "WeiDU exited with status {} without output",
      output.status
    ));
  }
  Ok(combined)
}

fn parse_json_array<T: for<'de> Deserialize<'de>>(text: &str) -> Result<Vec<T>, String> {
  let trimmed = text.trim();
  let start = trimmed
    .find('[')
    .ok_or_else(|| "No JSON array in WeiDU output".to_string())?;
  let end = trimmed
    .rfind(']')
    .ok_or_else(|| "Unclosed JSON array in WeiDU output".to_string())?;
  serde_json::from_str(&trimmed[start..=end]).map_err(|e| format!("Invalid JSON: {e}"))
}

#[tauri::command]
pub fn list_weidu_components(
  weidu_path: String,
  tp2_path: String,
  lang: i32,
) -> Result<Vec<WeiduComponentInfo>, String> {
  let weidu = validate_weidu_path(&weidu_path)?;
  let tp2 = PathBuf::from(tp2_path.trim());
  if !tp2.is_file() {
    return Err(format!("TP2 not found: {}", tp2.display()));
  }
  let cwd = tp2_working_dir(&tp2);
  let tp2_arg = tp2_arg_for_cwd(&tp2, &cwd);
  let args = vec![
    "--nogame".into(),
    "--noautoupdate".into(),
    "--list-components-json".into(),
    tp2_arg,
    lang.to_string(),
  ];
  let out = run_weidu_capture(&weidu, &cwd, &args)?;
  parse_json_array(&out)
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
  weidu_path: String,
  tp2_path: String,
) -> Result<Vec<WeiduLanguageInfo>, String> {
  let weidu = validate_weidu_path(&weidu_path)?;
  let tp2 = PathBuf::from(tp2_path.trim());
  if !tp2.is_file() {
    return Err(format!("TP2 not found: {}", tp2.display()));
  }
  let cwd = tp2_working_dir(&tp2);
  let tp2_arg = tp2_arg_for_cwd(&tp2, &cwd);
  let args = vec![
    "--nogame".into(),
    "--noautoupdate".into(),
    "--list-languages".into(),
    tp2_arg,
  ];
  let out = run_weidu_capture(&weidu, &cwd, &args)?;
  parse_languages_output(&out)
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
    "press any key",
  ];
  for p in CHOICE_PHRASES {
    if lower.contains(p) {
      return Some("inputRequired");
    }
  }
  if (lower.contains("choice") || lower.contains("choose"))
    && (lower.contains('?') || lower.contains(':'))
  {
    return Some("inputRequired");
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

fn verify_weidu_log(game_dir: &Path, tp2: &Path, lang: i32, numbers: &[i32]) -> bool {
  let log_path = game_dir.join("weidu.log");
  let Ok(text) = fs::read_to_string(&log_path) else {
    return false;
  };
  let tp2_norm = tp2.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
  let tp2_name = tp2
    .file_name()
    .map(|s| s.to_string_lossy().to_ascii_lowercase())
    .unwrap_or_default();
  let Ok(re) = Regex::new(r"(?i)^~([^~]+)~ #(\d+) #(\d+)") else {
    return false;
  };
  let mut found = 0usize;
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
    if numbers.contains(&num) {
      found += 1;
    }
  }
  found >= numbers.len()
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
      if let Some(level) = classify_line(&line) {
        if level == "inputRequired" {
          emit_event(
            &app,
            InstallEventPayload::InputRequired { prompt: line.clone() },
          );
        } else {
          emit_event(
            &app,
            InstallEventPayload::Classified {
              level: level.into(),
              message: line,
            },
          );
        }
      }
    }
  });
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
  let stdout_path = step_dir.join("stdout.log");
  let stderr_path = step_dir.join("stderr.log");
  let run_stdout = log_dir.join("run-stdout.log");
  let run_stderr = log_dir.join("run-stderr.log");
  let _ = fs::write(&stdout_path, "");
  let _ = fs::write(&stderr_path, "");

  let cwd = tp2_working_dir(&tp2);
  let tp2_arg = tp2_arg_for_cwd(&tp2, &cwd);
  let mut args: Vec<String> = vec![tp2_arg, "--force-install-list".into()];
  for n in &input.component_numbers {
    args.push(n.to_string());
  }
  args.push("--yes".into());
  args.push("--safe-exit".into());
  args.push("--language".into());
  args.push(input.language_index.to_string());

  emit_event(
    &app,
    InstallEventPayload::StepStarted {
      step_id: input.step_id.clone(),
    },
  );

  let timeout = Duration::from_secs(input.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));
  let cancel = Arc::clone(&state.cancel);

  let mut child = Command::new(&weidu)
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
    &input.component_numbers,
  );
  let success = !timed_out && !cancelled && exit_code == Some(0) && log_verified;

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
  stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_weidu_step(state: State<'_, RunningWeidu>) {
  state.request_cancel();
}

fn find_tp2_in_dir(dir: &Path) -> Result<PathBuf, String> {
  fn walk(dir: &Path, depth: usize, best: &mut Option<PathBuf>) -> Result<(), String> {
    if depth > 4 {
      return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
      let entry = entry.map_err(|e| e.to_string())?;
      let path = entry.path();
      if path.is_dir() {
        walk(&path, depth + 1, best)?;
        continue;
      }
      let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
      if name.ends_with(".tp2") {
        if name.starts_with("setup-") {
          *best = Some(path);
          return Ok(());
        }
        if best.is_none() {
          *best = Some(path);
        }
      }
    }
    Ok(())
  }
  let mut best = None;
  walk(dir, 0, &mut best)?;
  best.ok_or_else(|| format!("No .tp2 found under {}", dir.display()))
}

#[tauri::command]
pub fn stage_mod_into_game_dir(
  mods_download_dir: String,
  codename: String,
  game_dir: String,
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
  let source = download.join(&source_name);
  let target = game.join(&source_name);
  if target.exists() {
    if target.is_dir() {
      fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    } else {
      fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
  }
  copy_recursive(&source, &target)?;
  let tp2 = find_tp2_in_dir(&target)?;
  Ok(tp2.to_string_lossy().into_owned())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupInput {
  pub game_dir: String,
  pub staged_folders: Vec<String>,
  pub keep_folders: Vec<String>,
  pub weidu_path: String,
  pub log_dir: String,
}

#[tauri::command]
pub fn cleanup_install_artifacts(input: CleanupInput) -> Result<(), String> {
  let game = PathBuf::from(input.game_dir.trim());
  let log_dir = PathBuf::from(input.log_dir.trim());
  fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
  let keep: std::collections::HashSet<String> = input
    .keep_folders
    .iter()
    .map(|s| s.trim().to_ascii_lowercase())
    .collect();

  for folder in &input.staged_folders {
    let name = folder.trim();
    if name.is_empty() || keep.contains(&name.to_ascii_lowercase()) {
      continue;
    }
    let path = game.join(name);
    if path.is_dir() {
      fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
  }

  let weidu_src = validate_weidu_path(&input.weidu_path)?;
  let weidu_dest = game.join(
    weidu_src
      .file_name()
      .ok_or_else(|| "Invalid WeiDU path".to_string())?,
  );
  fs::copy(&weidu_src, &weidu_dest).map_err(|e| e.to_string())?;

  if game.is_dir() {
    if let Ok(entries) = fs::read_dir(&game) {
      for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
          continue;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name.ends_with(".debug") && name.contains("setup") {
          let dest = log_dir.join(entry.file_name());
          let _ = fs::rename(&path, &dest).or_else(|_| fs::copy(&path, &dest).map(|_| ()));
          let _ = fs::remove_file(&path);
        }
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
