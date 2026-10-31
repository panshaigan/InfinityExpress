//! Probe remote mod metadata and download/extract into the mods download directory.

use crate::bundled_tools::bundled_7z_path;
use crate::mod_fs::{ensure_under_parent, find_subdir_ci, validate_folder_name};
use crate::process_util::configure_headless;
use futures_util::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, State};

const PROGRESS_EVENT: &str = "mod-acquire-progress";
const USER_AGENT: &str = "InfinityExpress/0.9 (mod-acquire)";
const CANCELLED: &str = "Cancelled";

/// Shared abort flag for the in-flight `acquire_mod` download.
pub struct AcquireCancelFlag(pub Arc<AtomicBool>);

impl AcquireCancelFlag {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    pub fn clear(&self) {
        self.0.store(false, Ordering::SeqCst);
    }

    pub fn request(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_requested(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[tauri::command]
pub fn cancel_mod_acquire(flag: State<'_, AcquireCancelFlag>) {
    flag.request();
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeModInput {
    pub codename: String,
    pub url: String,
    /// GitHub track: empty/`release` = latest release; `main` = default branch tip; else branch name.
    pub track: String,
    /// GitHub download: empty/`zipball` = ref zipball; `asset` = release archive asset.
    pub download: String,
    /// Catalog size used only as a hint when remote size is unknown (frontend).
    pub catalog_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProbeResult {
    pub version: String,
    pub release: String,
    pub download_url: Option<String>,
    pub extension: Option<String>,
    pub strategy: String,
    pub size_bytes: Option<u64>,
    pub size_is_estimate: bool,
    pub used_scrape_fallback: bool,
    pub rate_limited: bool,
    /// Tag or branch name for GitHub zipball downloads.
    pub zipball_ref: Option<String>,
    pub owner: Option<String>,
    pub repo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcquireModInput {
    pub codename: String,
    pub url: String,
    pub track: String,
    pub download: String,
    pub download_dir: String,
    pub remote: RemoteProbeResult,
    pub github_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcquireModResult {
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModPageMeta {
    pub name: String,
    pub readme: String,
    pub author: String,
    pub release: String,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    codename: String,
    phase: String,
    message: String,
    bytes_received: Option<u64>,
    bytes_total: Option<u64>,
}

fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .redirect(reqwest::redirect::Policy::limited(10))
                .timeout(std::time::Duration::from_secs(7200))
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(|e| e.clone())
}

fn emit_progress(app: &AppHandle, payload: ProgressPayload) {
    let _ = app.emit(PROGRESS_EVENT, &payload);
}

fn parse_github_owner_repo(url: &str) -> Result<(String, String), String> {
    let re = Regex::new(r"(?i)github\.com/([^/]+)/([^/#?]+)").map_err(|e| e.to_string())?;
    let caps = re
        .captures(url.trim().trim_end_matches('/'))
        .ok_or_else(|| "Not a GitHub repository URL".to_string())?;
    let owner = caps.get(1).unwrap().as_str().to_string();
    let repo = caps
        .get(2)
        .unwrap()
        .as_str()
        .trim_end_matches(".git")
        .to_string();
    Ok((owner, repo))
}

fn ext_from_name(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

fn same_site_referer(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?;
    let port = parsed.port().map(|p| format!(":{p}")).unwrap_or_default();
    Some(format!("{}://{host}{port}/", parsed.scheme()))
}

fn archive_ext_from_response(
    final_url: &reqwest::Url,
    content_disposition: Option<&str>,
    content_type: Option<&str>,
) -> Option<String> {
    let disposition_name = content_disposition.and_then(|value| {
        Regex::new(r#"(?i)filename\*?=(?:UTF-8''|\")?([^\";]+)"#)
            .ok()?
            .captures(value)?
            .get(1)
            .map(|m| m.as_str().trim())
    });
    disposition_name
        .and_then(ext_from_name)
        .or_else(|| {
            final_url
                .path_segments()
                .and_then(|mut parts| parts.next_back())
                .and_then(ext_from_name)
        })
        .filter(|ext| is_archive_ext(ext))
        .or_else(|| {
            match content_type
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str()
            {
                value if value.contains("zip") => Some("zip".into()),
                value if value.contains("7z") => Some("7z".into()),
                value if value.contains("rar") => Some("rar".into()),
                _ => None,
            }
        })
}

fn is_archive_ext(ext: &str) -> bool {
    matches!(ext, "zip" | "7z" | "rar")
}

/// Turn a GitHub href (absolute or site-relative) into an https://github.com URL.
fn absolutize_github_href(href: &str) -> Option<String> {
    let h = href.trim();
    if h.is_empty() {
        return None;
    }
    if h.starts_with("https://github.com/") || h.starts_with("http://github.com/") {
        return Some(h.to_string());
    }
    if h.starts_with('/') {
        return Some(format!("https://github.com{h}"));
    }
    None
}

/// Parse release asset download links from GitHub HTML (release page or expanded_assets).
/// Ignores source-code archive links under `/archive/`. Prefers largest when sizes are known.
fn pick_release_download_asset(html: &str) -> Option<(String, String, Option<u64>)> {
    let re = Regex::new(
        r#"(?i)href="((?:https://github\.com)?/[^"]+/releases/download/[^"]+\.(?:zip|7z|rar))""#,
    )
    .ok()?;
    let mut best: Option<(String, String, u64)> = None;
    let mut first: Option<(String, String)> = None;
    for caps in re.captures_iter(html) {
        let raw = caps.get(1)?.as_str();
        if raw.contains("/archive/") {
            continue;
        }
        let Some(url) = absolutize_github_href(raw) else {
            continue;
        };
        let ext = ext_from_name(&url).unwrap_or_else(|| "zip".into());
        if first.is_none() {
            first = Some((url.clone(), ext.clone()));
        }
        // Look ahead a short window for a byte size (GitHub expanded_assets lists size near the link).
        let end = caps.get(0)?.end();
        let window = &html[end..html.len().min(end + 400)];
        let size = parse_nearby_asset_size(window).unwrap_or(0);
        if best.as_ref().map(|b| b.2).unwrap_or(0) < size {
            best = Some((url, ext, size));
        }
    }
    if let Some((url, ext, size)) = best.filter(|b| b.2 > 0) {
        return Some((url, ext, Some(size)));
    }
    first.map(|(url, ext)| (url, ext, None))
}

fn parse_nearby_asset_size(window: &str) -> Option<u64> {
    // e.g. "978 MB", "1.2 GB", "337785344" (raw bytes rare in HTML)
    let re = Regex::new(r"(?i)([\d.]+)\s*(B|KB|MB|GB|TB)\b").ok()?;
    let caps = re.captures(window)?;
    let n: f64 = caps.get(1)?.as_str().parse().ok()?;
    let unit = caps.get(2)?.as_str().to_ascii_uppercase();
    let mult = match unit.as_str() {
        "B" => 1.0,
        "KB" => 1024.0,
        "MB" => 1024.0 * 1024.0,
        "GB" => 1024.0 * 1024.0 * 1024.0,
        "TB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some((n * mult) as u64)
}

fn branch_tip_result(
    owner: &str,
    repo: &str,
    branch: &str,
    version: String,
    release: String,
    used_scrape_fallback: bool,
    rate_limited: bool,
) -> RemoteProbeResult {
    RemoteProbeResult {
        version,
        release,
        download_url: Some(format!(
            "https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}"
        )),
        extension: Some("zip".into()),
        strategy: "github_zipball_branch".into(),
        size_bytes: None,
        size_is_estimate: false,
        used_scrape_fallback,
        rate_limited,
        zipball_ref: Some(branch.to_string()),
        owner: Some(owner.to_string()),
        repo: Some(repo.to_string()),
    }
}

async fn github_probe_branch_tip_api(
    owner: &str,
    repo: &str,
    token: Option<&str>,
    rate_limited: bool,
) -> Result<RemoteProbeResult, String> {
    let api = format!("https://api.github.com/repos/{owner}/{repo}");
    let mut rl = rate_limited;
    let (json, commits_rl) = fetch_json(&format!("{api}/commits?per_page=1"), token).await?;
    rl |= commits_rl;
    let commit = json
        .as_array()
        .and_then(|a| a.first())
        .ok_or_else(|| "No commits returned".to_string())?;
    let sha = commit
        .get("sha")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing commit sha".to_string())?;
    let short = sha[..sha.len().min(7)].to_string();
    let date = commit
        .pointer("/commit/author/date")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    // Prefer main, then master for the zipball URL; version stays tip SHA.
    let branch = match resolve_github_branch_zipball(owner, repo, "main", token).await {
        Ok(u) if u.contains("/heads/master") => "master",
        Ok(_) => "main",
        Err(_) => "main",
    };
    Ok(branch_tip_result(
        owner,
        repo,
        branch,
        short,
        date_prefix(date),
        false,
        rl,
    ))
}

async fn github_probe_branch_tip_scrape(
    owner: &str,
    repo: &str,
) -> Result<RemoteProbeResult, String> {
    for branch in ["main", "master"] {
        let url = format!("https://github.com/{owner}/{repo}/commits/{branch}");
        if let Ok((html, _)) = fetch_text(&url, None).await {
            let re = Regex::new(r#"/commit/([0-9a-f]{40})"#).map_err(|e| e.to_string())?;
            if let Some(caps) = re.captures(&html) {
                let sha = caps.get(1).unwrap().as_str();
                let short = sha[..7].to_string();
                return Ok(branch_tip_result(
                    owner,
                    repo,
                    branch,
                    short,
                    String::new(),
                    true,
                    true,
                ));
            }
        }
    }
    Err("Could not scrape default branch tip from GitHub".into())
}

async fn fetch_text(url: &str, token: Option<&str>) -> Result<(String, bool), String> {
    let client = http_client()?;
    let mut req = client.get(url);
    if let Some(t) = token.filter(|s| !s.is_empty()) {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    if url.contains("api.github.com") {
        req = req.header("Accept", "application/vnd.github+json");
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let rate_limited = status.as_u16() == 403 || status.as_u16() == 429;
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {status} for {url}: {body}"));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok((text, rate_limited))
}

async fn fetch_json(url: &str, token: Option<&str>) -> Result<(serde_json::Value, bool), String> {
    let (text, rate_limited) = match fetch_text(url, token).await {
        Ok(v) => v,
        Err(e) => {
            let rate = e.contains("HTTP 403") || e.contains("HTTP 429");
            return Err(e).map_err(|err| {
                if rate {
                    format!("{err} (rate_limited)")
                } else {
                    err
                }
            });
        }
    };
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok((value, rate_limited))
}

fn date_prefix(s: &str) -> String {
    if s.len() >= 10 {
        s[..10].to_string()
    } else {
        s.to_string()
    }
}

fn normalize_track(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("release") {
        String::new()
    } else {
        s.to_string()
    }
}

fn wants_asset_download(download: &str, track: &str) -> bool {
    let is_release = normalize_track(track).is_empty();
    is_release && download.trim().eq_ignore_ascii_case("asset")
}

async fn github_probe_named_branch_api(
    owner: &str,
    repo: &str,
    branch: &str,
    token: Option<&str>,
    rate_limited: bool,
) -> Result<RemoteProbeResult, String> {
    let api = format!("https://api.github.com/repos/{owner}/{repo}");
    let mut rl = rate_limited;
    let mut commits_url =
        reqwest::Url::parse(&format!("{api}/commits")).map_err(|e| e.to_string())?;
    {
        let mut qp = commits_url.query_pairs_mut();
        qp.append_pair("sha", branch);
        qp.append_pair("per_page", "1");
    }
    let (json, commits_rl) = fetch_json(commits_url.as_str(), token).await?;
    rl |= commits_rl;
    let commit = json
        .as_array()
        .and_then(|a| a.first())
        .ok_or_else(|| format!("No commits returned for branch {branch}"))?;
    let sha = commit
        .get("sha")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing commit sha".to_string())?;
    let short = sha[..sha.len().min(7)].to_string();
    let date = commit
        .pointer("/commit/author/date")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let zip_url = resolve_github_branch_zipball(owner, repo, branch, token).await?;
    let resolved = zip_url
        .rsplit("/heads/")
        .next()
        .unwrap_or(branch)
        .to_string();
    Ok(branch_tip_result(
        owner,
        repo,
        &resolved,
        short,
        date_prefix(date),
        false,
        rl,
    ))
}

async fn github_probe_named_branch_scrape(
    owner: &str,
    repo: &str,
    branch: &str,
) -> Result<RemoteProbeResult, String> {
    let url = format!("https://github.com/{owner}/{repo}/commits/{branch}");
    let (html, _) = fetch_text(&url, None).await?;
    let re = Regex::new(r#"/commit/([0-9a-f]{40})"#).map_err(|e| e.to_string())?;
    let caps = re
        .captures(&html)
        .ok_or_else(|| format!("Could not scrape tip for branch {branch}"))?;
    let sha = caps.get(1).unwrap().as_str();
    let short = sha[..7].to_string();
    Ok(branch_tip_result(
        owner,
        repo,
        branch,
        short,
        String::new(),
        true,
        true,
    ))
}

async fn github_probe_api(
    owner: &str,
    repo: &str,
    track: &str,
    download: &str,
    token: Option<&str>,
) -> Result<RemoteProbeResult, String> {
    let api = format!("https://api.github.com/repos/{owner}/{repo}");
    let mut rate_limited = false;
    let track_norm = normalize_track(track);
    let use_assets = wants_asset_download(download, track);

    if track_norm == "main" {
        return github_probe_branch_tip_api(owner, repo, token, rate_limited).await;
    }
    if !track_norm.is_empty() {
        return github_probe_named_branch_api(owner, repo, &track_norm, token, rate_limited).await;
    }

    match fetch_json(&format!("{api}/releases/latest"), token).await {
        Ok((json, rl)) => {
            rate_limited |= rl;
            let tag = json
                .get("tag_name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing tag_name".to_string())?
                .to_string();
            let release = json
                .get("published_at")
                .and_then(|v| v.as_str())
                .map(date_prefix)
                .unwrap_or_default();

            if use_assets {
                let mut best: Option<(String, String, u64)> = None;
                if let Some(assets) = json.get("assets").and_then(|a| a.as_array()) {
                    for asset in assets {
                        let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let Some(ext) = ext_from_name(name).filter(|e| is_archive_ext(e)) else {
                            continue;
                        };
                        let url = asset
                            .get("browser_download_url")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if url.is_empty() {
                            continue;
                        }
                        let size = asset.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                        if best.as_ref().map(|b| b.2).unwrap_or(0) < size {
                            best = Some((url.to_string(), ext, size));
                        }
                    }
                }
                if let Some((url, ext, size)) = best {
                    return Ok(RemoteProbeResult {
                        version: tag,
                        release,
                        download_url: Some(url),
                        extension: Some(ext),
                        strategy: "github_asset".into(),
                        size_bytes: if size > 0 { Some(size) } else { None },
                        size_is_estimate: false,
                        used_scrape_fallback: false,
                        rate_limited,
                        zipball_ref: None,
                        owner: Some(owner.to_string()),
                        repo: Some(repo.to_string()),
                    });
                }
                let body = json.get("body").and_then(|v| v.as_str()).unwrap_or("");
                let re = Regex::new(r#"(?i)https?://[^\s)\"'<>]+\.(?:zip|7z|rar)"#)
                    .map_err(|e| e.to_string())?;
                if let Some(m) = re.find(body) {
                    let url = m.as_str().to_string();
                    let ext = ext_from_name(&url).unwrap_or_else(|| "zip".into());
                    return Ok(RemoteProbeResult {
                        version: tag,
                        release,
                        download_url: Some(url),
                        extension: Some(ext),
                        strategy: "github_body_url".into(),
                        size_bytes: None,
                        size_is_estimate: false,
                        used_scrape_fallback: false,
                        rate_limited,
                        zipball_ref: None,
                        owner: Some(owner.to_string()),
                        repo: Some(repo.to_string()),
                    });
                }
                return Err(
          "Download=asset but no .zip/.7z/.rar assets or description links found on latest release"
            .into(),
        );
            }

            Ok(RemoteProbeResult {
                version: tag.clone(),
                release,
                download_url: Some(format!(
                    "https://codeload.github.com/{owner}/{repo}/zip/refs/tags/{tag}"
                )),
                extension: Some("zip".into()),
                strategy: "github_zipball_tag".into(),
                size_bytes: None,
                size_is_estimate: false,
                used_scrape_fallback: false,
                rate_limited,
                zipball_ref: Some(tag),
                owner: Some(owner.to_string()),
                repo: Some(repo.to_string()),
            })
        }
        Err(e) if use_assets => Err(e),
        Err(_) => {
            // No releases: fall back to main/master branch tip (release+zipball only).
            github_probe_branch_tip_api(owner, repo, token, rate_limited).await
        }
    }
}

async fn github_probe_scrape(
    owner: &str,
    repo: &str,
    track: &str,
    download: &str,
) -> Result<RemoteProbeResult, String> {
    let track_norm = normalize_track(track);
    let use_assets = wants_asset_download(download, track);

    if track_norm == "main" {
        return github_probe_branch_tip_scrape(owner, repo).await;
    }
    if !track_norm.is_empty() {
        return github_probe_named_branch_scrape(owner, repo, &track_norm).await;
    }

    let latest = format!("https://github.com/{owner}/{repo}/releases/latest");
    let client = http_client()?;
    let res = client
        .get(&latest)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let final_url = res.url().clone();
    let html = res.text().await.map_err(|e| e.to_string())?;

    // No releases (or soft 404 page that never redirects to a tag): use branch tip.
    let tag = final_url
        .path_segments()
        .and_then(|mut s| s.next_back())
        .filter(|t| *t != "latest" && *t != "releases")
        .map(|s| s.to_string())
        .or_else(|| {
            let re = Regex::new(r#"/releases/tag/([^\"'?#]+)"#).ok()?;
            re.captures(&html)
                .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        });

    let Some(tag) = tag else {
        if use_assets {
            return Err(format!(
                "Download=asset but no releases found for {owner}/{repo} (HTTP {status})"
            ));
        }
        return github_probe_branch_tip_scrape(owner, repo).await;
    };

    if use_assets {
        // Assets are reliably listed on expanded_assets (often relative hrefs).
        let expanded = format!("https://github.com/{owner}/{repo}/releases/expanded_assets/{tag}");
        let assets_html = match fetch_text(&expanded, None).await {
            Ok((t, _)) => t,
            Err(_) => html.clone(),
        };
        if let Some((url, ext, size)) =
            pick_release_download_asset(&assets_html).or_else(|| pick_release_download_asset(&html))
        {
            return Ok(RemoteProbeResult {
                version: tag,
                release: String::new(),
                download_url: Some(url),
                extension: Some(ext),
                strategy: "github_asset".into(),
                size_bytes: size,
                size_is_estimate: false,
                used_scrape_fallback: true,
                rate_limited: true,
                zipball_ref: None,
                owner: Some(owner.to_string()),
                repo: Some(repo.to_string()),
            });
        }
        let body_re = Regex::new(r#"(?i)https?://[^\s)\"'<>]+\.(?:zip|7z|rar)"#)
            .map_err(|e| e.to_string())?;
        if let Some(m) = body_re.find(&html) {
            let url = m.as_str().to_string();
            if !url.contains("/archive/") {
                let ext = ext_from_name(&url).unwrap_or_else(|| "zip".into());
                return Ok(RemoteProbeResult {
                    version: tag,
                    release: String::new(),
                    download_url: Some(url),
                    extension: Some(ext),
                    strategy: "github_body_url".into(),
                    size_bytes: None,
                    size_is_estimate: false,
                    used_scrape_fallback: true,
                    rate_limited: true,
                    zipball_ref: None,
                    owner: Some(owner.to_string()),
                    repo: Some(repo.to_string()),
                });
            }
        }
        return Err("Download=asset but no archive links found on release page".into());
    }

    Ok(RemoteProbeResult {
        version: tag.clone(),
        release: String::new(),
        download_url: Some(format!(
            "https://codeload.github.com/{owner}/{repo}/zip/refs/tags/{tag}"
        )),
        extension: Some("zip".into()),
        strategy: "github_zipball_tag".into(),
        size_bytes: None,
        size_is_estimate: false,
        used_scrape_fallback: true,
        rate_limited: true,
        zipball_ref: Some(tag),
        owner: Some(owner.to_string()),
        repo: Some(repo.to_string()),
    })
}

async fn resolve_github_branch_zipball(
    owner: &str,
    repo: &str,
    preferred: &str,
    token: Option<&str>,
) -> Result<String, String> {
    // Default-branch tip (`main`): try main then master. Custom branch: exact only.
    let alts: Vec<&str> = match preferred {
        "main" | "master" => vec!["main", "master"],
        other if !other.is_empty() => vec![other],
        _ => vec!["main", "master"],
    };
    for branch in &alts {
        let url = format!("https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}");
        let client = http_client()?;
        let mut req = client.head(&url);
        if let Some(t) = token.filter(|s| !s.is_empty()) {
            req = req.header("Authorization", format!("Bearer {t}"));
        }
        if let Ok(res) = req.send().await {
            if res.status().is_success() {
                return Ok(url);
            }
        }
        // Some hosts reject HEAD; try a tiny ranged GET via GET status check on API
        let api = format!("https://api.github.com/repos/{owner}/{repo}/branches/{branch}");
        if fetch_json(&api, token).await.is_ok() {
            return Ok(format!(
                "https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}"
            ));
        }
    }
    Err(format!(
        "Could not resolve branch zipball for {owner}/{repo} (tried {})",
        alts.join(", ")
    ))
}

async fn probe_github(
    url: &str,
    track: &str,
    download: &str,
    token: Option<&str>,
) -> Result<RemoteProbeResult, String> {
    let (owner, repo) = parse_github_owner_repo(url)?;
    match github_probe_api(&owner, &repo, track, download, token).await {
        Ok(mut remote) => {
            if remote.strategy == "github_zipball_branch" {
                let preferred = remote.zipball_ref.as_deref().unwrap_or("main");
                if let Ok(u) = resolve_github_branch_zipball(&owner, &repo, preferred, token).await
                {
                    remote.download_url = Some(u.clone());
                    if let Some(branch) = u.rsplit("/heads/").next() {
                        remote.zipball_ref = Some(branch.to_string());
                    }
                }
            }
            Ok(remote)
        }
        Err(e) => {
            let rate = e.contains("403") || e.contains("429") || e.contains("rate_limited");
            if rate || token.is_none() {
                let mut remote = github_probe_scrape(&owner, &repo, track, download).await?;
                remote.rate_limited = remote.rate_limited || rate;
                Ok(remote)
            } else {
                Err(e)
            }
        }
    }
}

async fn probe_weasel(url: &str) -> Result<RemoteProbeResult, String> {
    let (html, _) = fetch_text(url, None).await?;
    let ver_re = Regex::new(r"(?s)<strong>Version</strong><br\s*/?>\s*([^<]+)")
        .map_err(|e| e.to_string())?;
    let dl_re = Regex::new(r#"data-downloadurl="([^"]+)""#).map_err(|e| e.to_string())?;
    let date_re = Regex::new(r"(?s)<strong>Last Updated</strong><br\s*/?>\s*([^<]+)")
        .map_err(|e| e.to_string())?;
    let version = ver_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        .ok_or_else(|| "WeaselMods: version not found".to_string())?;
    let download_url = dl_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| "WeaselMods: download URL not found".to_string())?;
    let release = date_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        .and_then(|s| parse_flexible_date(&s))
        .unwrap_or_default();
    Ok(RemoteProbeResult {
        version,
        release,
        download_url: Some(download_url),
        extension: Some("zip".into()),
        strategy: "weasel".into(),
        size_bytes: None,
        size_is_estimate: false,
        used_scrape_fallback: false,
        rate_limited: false,
        zipball_ref: None,
        owner: None,
        repo: None,
    })
}

async fn probe_morpheus(url: &str, codename: &str) -> Result<RemoteProbeResult, String> {
    let (html, _) = fetch_text(url, None).await?;
    let ver_re =
        Regex::new(r"(?i)<strong>Version\s+([^<]+)</strong>").map_err(|e| e.to_string())?;
    let dl_re =
        Regex::new(r#"href="(https://www\.dropbox\.com/[^"]+)""#).map_err(|e| e.to_string())?;
    let date_re = Regex::new(
    r"(?i)(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}",
  )
  .map_err(|e| e.to_string())?;

    let mut version = ver_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        .unwrap_or_default();
    let mut download = dl_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .unwrap_or_default();
    download = download
        .replace("www.dropbox.com", "dl.dropboxusercontent.com")
        .replace("dl=0", "dl=1");
    let mut date_raw = date_re
        .find(&html)
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();

    if codename.eq_ignore_ascii_case("fight-the-heavens") {
        if version.is_empty() {
            version = "v1.2".into();
        }
        if date_raw.is_empty() {
            date_raw = "2025-10-11".into();
        }
    }
    if version.is_empty() {
        return Err("Morpheus-Mart: version not found".into());
    }
    if download.is_empty() {
        return Err("Morpheus-Mart: Dropbox download link not found".into());
    }
    let release = parse_flexible_date(&date_raw).unwrap_or_else(|| date_raw.clone());
    Ok(RemoteProbeResult {
        version,
        release,
        download_url: Some(download),
        extension: Some("zip".into()),
        strategy: "morpheus".into(),
        size_bytes: None,
        size_is_estimate: false,
        used_scrape_fallback: false,
        rate_limited: false,
        zipball_ref: None,
        owner: None,
        repo: None,
    })
}

async fn probe_israelbarbuzano(url: &str) -> Result<RemoteProbeResult, String> {
    let (html, _) = fetch_text(url, None).await?;
    let dl_re = Regex::new(r#"href="(http://www\.israelbarbuzano\.net/imoen/files/[^"]+)""#)
        .map_err(|e| e.to_string())?;
    let ver_re = Regex::new(r"(?i)DOWNLOAD</a>\s*-\s*v([\d.]+)").map_err(|e| e.to_string())?;
    let date_re = Regex::new(r"(?i)DOWNLOAD</a>\s*-\s*v[\d.]+\s+([A-Za-z]+\s+\d+\w*\s+\d{4})")
        .map_err(|e| e.to_string())?;
    let download_url = dl_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| "israelbarbuzano: download link not found".to_string())?;
    let version = ver_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .ok_or_else(|| "israelbarbuzano: version not found".to_string())?;
    let date_raw = date_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .map(|s| {
            Regex::new(r"(?i)(\d+)(st|nd|rd|th)")
                .ok()
                .and_then(|re| Some(re.replace(&s, "$1").to_string()))
                .unwrap_or(s)
        })
        .unwrap_or_default();
    let release = parse_flexible_date(&date_raw).unwrap_or_default();
    Ok(RemoteProbeResult {
        version,
        release,
        download_url: Some(download_url),
        extension: Some("zip".into()),
        strategy: "israelbarbuzano".into(),
        size_bytes: None,
        size_is_estimate: false,
        used_scrape_fallback: false,
        rate_limited: false,
        zipball_ref: None,
        owner: None,
        repo: None,
    })
}

async fn probe_baldurs_gate_de(url: &str) -> Result<RemoteProbeResult, String> {
    let (html, _) = fetch_text(url, None).await?;
    let ver_re = Regex::new(
        r#"(?s)<h1 class="p-title-value">\s*.*?<span class="u-muted">\s*(.*?)\s*</span>"#,
    )
    .map_err(|e| e.to_string())?;
    let date_re =
        Regex::new(r#"(?s)<dt>Letzte Bearbeitung</dt>\s*<dd><time[^>]*data-date-string="([^"]+)""#)
            .map_err(|e| e.to_string())?;
    let version = ver_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        .ok_or_else(|| "baldurs-gate.de: version not found".to_string())?;
    let release = date_re
        .captures(&html)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .and_then(|s| parse_flexible_date(&s))
        .unwrap_or_default();
    let base = url.trim_end_matches('/');
    let download_url = format!("{base}/download");
    Ok(RemoteProbeResult {
        version,
        release,
        download_url: Some(download_url),
        extension: Some("rar".into()),
        strategy: "baldurs_gate_de".into(),
        size_bytes: None,
        size_is_estimate: false,
        used_scrape_fallback: false,
        rate_limited: false,
        zipball_ref: None,
        owner: None,
        repo: None,
    })
}

fn html_text(raw: &str) -> String {
    let without_tags = Regex::new(r"(?is)<[^>]+>")
        .ok()
        .map(|re| re.replace_all(raw, " ").to_string())
        .unwrap_or_else(|| raw.to_string());
    decode_basic_entities(&without_tags)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_size_bytes(value: &str, unit: &str) -> Option<u64> {
    let amount: f64 = value.trim().parse().ok()?;
    let multiplier = match unit.trim().to_ascii_lowercase().as_str() {
        "b" => 1_f64,
        "kb" => 1024_f64,
        "mb" => 1024_f64 * 1024_f64,
        "gb" => 1024_f64 * 1024_f64 * 1024_f64,
        _ => return None,
    };
    Some((amount * multiplier).round() as u64)
}

fn g3_page_meta_from_html(html: &str) -> ModPageMeta {
    let text = html_text(html);
    let author = Regex::new(r#"(?is)\bBy\s*<a\b[^>]*>(.*?)</a>"#)
        .ok()
        .and_then(|re| re.captures(html))
        .and_then(|caps| caps.get(1))
        .map(|m| html_text(m.as_str()))
        .unwrap_or_default();
    let readme = Regex::new(r#"(?is)<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>"#)
        .ok()
        .and_then(|re| {
            re.captures_iter(html).find_map(|caps| {
                let label = html_text(caps.get(2)?.as_str());
                label
                    .to_ascii_lowercase()
                    .contains("view the readme")
                    .then(|| decode_basic_entities(caps.get(1).unwrap().as_str()))
            })
        })
        .unwrap_or_default();
    let release = Regex::new(r"(?i)\bUpdated\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})")
        .ok()
        .and_then(|re| re.captures(&text))
        .and_then(|caps| caps.get(1))
        .and_then(|m| parse_flexible_date(m.as_str()))
        .unwrap_or_default();

    ModPageMeta {
        name: first_html_heading(html).unwrap_or_default(),
        readme,
        author,
        release,
        size_bytes: None,
    }
}

fn g3_linux_asset_from_html(html: &str, page_url: &str) -> Option<(String, u64)> {
    let anchor_re = Regex::new(r#"(?is)<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>.*?</a>"#).ok()?;
    let linux_name_re = Regex::new(r#"(?i)lin-[^<>"']+\.(?:zip|7z|rar)"#).ok()?;
    let size_re = Regex::new(r"(?i)(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)\b").ok()?;

    for linux_name in linux_name_re.find_iter(html) {
        let mut end = (linux_name.end() + 1600).min(html.len());
        while end > linux_name.end() && !html.is_char_boundary(end) {
            end -= 1;
        }
        let nearby = &html[linux_name.end()..end];
        let caps = anchor_re.captures(nearby)?;
        let href = decode_basic_entities(caps.get(1)?.as_str());
        if !href.contains("do=download") && !href.contains("confirm=1") {
            continue;
        }
        let url = reqwest::Url::parse(page_url)
            .ok()?
            .join(&href)
            .ok()?
            .to_string();
        let size = size_re
            .captures(nearby)
            .and_then(|size_caps| {
                parse_size_bytes(size_caps.get(1)?.as_str(), size_caps.get(2)?.as_str())
            })
            .unwrap_or(0);
        return Some((url, size));
    }
    None
}

async fn probe_gibberlings3(url: &str) -> Result<RemoteProbeResult, String> {
    let (page_html, _) = fetch_text(url, None).await?;
    let meta = g3_page_meta_from_html(&page_html);
    let download_page = format!("{}/?do=download", url.trim_end_matches('/'));
    let (download_html, _) = fetch_text(&download_page, None).await?;
    let (download_url, size_bytes) = g3_linux_asset_from_html(&download_html, &download_page)
        .ok_or_else(|| "Gibberlings3: Linux archive not found".to_string())?;
    let version = Regex::new(r"(?i)\b(v\d+(?:\.\d+)*)\b")
        .ok()
        .and_then(|re| re.captures(&meta.name))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| meta.release.clone());

    Ok(RemoteProbeResult {
        version,
        release: meta.release,
        download_url: Some(download_url),
        extension: Some("zip".into()),
        strategy: "gibberlings3_linux".into(),
        size_bytes: (size_bytes > 0).then_some(size_bytes),
        size_is_estimate: false,
        used_scrape_fallback: false,
        rate_limited: false,
        zipball_ref: None,
        owner: (!meta.author.is_empty()).then_some(meta.author),
        repo: None,
    })
}

async fn probe_direct(url: &str) -> Result<RemoteProbeResult, String> {
    let mut request = http_client()?.get(url);
    if let Some(referer) = same_site_referer(url) {
        request = request.header(reqwest::header::REFERER, referer);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status} for {url}"));
    }
    let final_url = response.url().clone();
    let content_disposition = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok());
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok());
    let extension = archive_ext_from_response(&final_url, content_disposition, content_type)
        .ok_or_else(|| {
            format!(
                "Direct link did not resolve to a supported .zip, .7z, or .rar archive: {final_url}"
            )
        })?;
    let size_bytes = response.content_length();
    let version = response
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .or_else(|| {
            response
                .headers()
                .get(reqwest::header::LAST_MODIFIED)
                .and_then(|v| v.to_str().ok())
        })
        .map(|s| s.trim_matches(['"', ' ']).to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            final_url
                .path_segments()
                .and_then(|mut parts| parts.next_back())
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| size_bytes.map(|s| s.to_string()).unwrap_or_default());

    Ok(RemoteProbeResult {
        version,
        release: String::new(),
        download_url: Some(final_url.to_string()),
        extension: Some(extension),
        strategy: "direct".into(),
        size_bytes,
        size_is_estimate: false,
        used_scrape_fallback: false,
        rate_limited: false,
        zipball_ref: None,
        owner: None,
        repo: None,
    })
}

fn parse_flexible_date(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.len() >= 10 && s.as_bytes()[4] == b'-' {
        return Some(s[..10].to_string());
    }
    // Try chrono-less parsing via common formats using naive string month map.
    let months: &[(&str, u32)] = &[
        ("january", 1),
        ("february", 2),
        ("march", 3),
        ("april", 4),
        ("may", 5),
        ("june", 6),
        ("july", 7),
        ("august", 8),
        ("september", 9),
        ("october", 10),
        ("november", 11),
        ("december", 12),
    ];
    let lower = s.to_ascii_lowercase();
    for (name, num) in months {
        if let Some(rest) = lower.strip_prefix(name) {
            let rest = rest.trim().trim_start_matches(',').trim();
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() >= 2 {
                let day: u32 = parts[0]
                    .trim_matches(',')
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .ok()?;
                let year: u32 = parts[1]
                    .trim_matches(',')
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .ok()?;
                return Some(format!("{year:04}-{num:02}-{day:02}"));
            }
        }
    }
    None
}

async fn probe_mod_inner(
    input: &ProbeModInput,
    github_token: Option<&str>,
) -> Result<RemoteProbeResult, String> {
    let url = input.url.trim().trim_end_matches('/');
    if url.is_empty() {
        return Err("Mod has no download URL".into());
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains("github.com") {
        return probe_github(url, &input.track, &input.download, github_token).await;
    }
    if lower.contains("gibberlings3.net/files/file/") {
        return probe_gibberlings3(url).await;
    }
    if lower.contains("downloads.weaselmods.net") {
        return probe_weasel(url).await;
    }
    if lower.contains("morpheus-mart.com") {
        return probe_morpheus(url, &input.codename).await;
    }
    if lower.contains("israelbarbuzano.net") {
        return probe_israelbarbuzano(url).await;
    }
    if lower.contains("baldurs-gate.de") {
        return probe_baldurs_gate_de(url).await;
    }
    probe_direct(url).await
}

#[tauri::command]
pub async fn probe_mod_remote(
    mod_input: ProbeModInput,
    github_token: Option<String>,
) -> Result<RemoteProbeResult, String> {
    probe_mod_inner(&mod_input, github_token.as_deref()).await
}

const META_HTML_CAP: usize = 512 * 1024;

fn decode_basic_entities(raw: &str) -> String {
    raw.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

fn strip_html_tags(raw: &str) -> String {
    Regex::new(r"(?is)<[^>]+>")
        .ok()
        .map(|re| re.replace_all(raw, "").to_string())
        .unwrap_or_else(|| raw.to_string())
}

/// First visible page heading (`h1`, else `h2`). Empty when none found.
fn first_html_heading(html: &str) -> Option<String> {
    for tag in ["h1", "h2"] {
        let Ok(re) = Regex::new(&format!(r"(?is)<{tag}\b[^>]*>(.*?)</{tag}>")) else {
            continue;
        };
        for caps in re.captures_iter(html) {
            let Some(inner) = caps.get(1) else {
                continue;
            };
            let text = decode_basic_entities(&strip_html_tags(inner.as_str()));
            let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ");
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
    }
    None
}

async fn scrape_page_meta_from_html(url: &str) -> Result<ModPageMeta, String> {
    let mut request = http_client()?.get(url);
    if let Some(referer) = same_site_referer(url) {
        request = request.header(reqwest::header::REFERER, referer);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status} for {url}"));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !content_type.is_empty()
        && !content_type.contains("html")
        && !content_type.starts_with("text/")
    {
        return Ok(ModPageMeta {
            name: String::new(),
            readme: String::new(),
            author: String::new(),
            release: String::new(),
            size_bytes: response.content_length(),
        });
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        let remaining = META_HTML_CAP.saturating_sub(bytes.len());
        if remaining == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
        if bytes.len() >= META_HTML_CAP {
            break;
        }
    }
    let html = String::from_utf8_lossy(&bytes);
    Ok(ModPageMeta {
        name: first_html_heading(&html).unwrap_or_default(),
        readme: String::new(),
        author: String::new(),
        release: String::new(),
        size_bytes: None,
    })
}

async fn scrape_mod_page_meta_inner(
    url: &str,
    _token: Option<&str>,
) -> Result<ModPageMeta, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL is required".into());
    }
    if trimmed
        .to_ascii_lowercase()
        .contains("gibberlings3.net/files/file/")
    {
        let page = trimmed.trim_end_matches('/');
        let (html, _) = fetch_text(page, None).await?;
        let mut meta = g3_page_meta_from_html(&html);
        let download_page = format!("{page}/?do=download");
        if let Ok((download_html, _)) = fetch_text(&download_page, None).await {
            if let Some((_, size)) = g3_linux_asset_from_html(&download_html, &download_page) {
                meta.size_bytes = (size > 0).then_some(size);
            }
        }
        return Ok(meta);
    }
    // Prefer the public HTML page (first heading), including GitHub — do not
    // use API description / repo slug / readme-link heuristics.
    let page = if let Ok((owner, repo)) = parse_github_owner_repo(trimmed) {
        format!("https://github.com/{owner}/{repo}")
    } else {
        trimmed.to_string()
    };
    scrape_page_meta_from_html(&page).await
}

#[tauri::command]
pub async fn scrape_mod_page_meta(
    url: String,
    github_token: Option<String>,
) -> Result<ModPageMeta, String> {
    scrape_mod_page_meta_inner(&url, github_token.as_deref()).await
}

async fn download_to_file(
    app: &AppHandle,
    codename: &str,
    url: &str,
    dest: &Path,
    token: Option<&str>,
    cancel: &AcquireCancelFlag,
    expected_size: Option<u64>,
) -> Result<u64, String> {
    let client = http_client()?;
    let mut req = client.get(url);
    if let Some(referer) = same_site_referer(url) {
        req = req.header(reqwest::header::REFERER, referer);
    }
    if let Some(t) = token.filter(|s| !s.is_empty()) {
        if url.contains("api.github.com") || url.contains("codeload.github.com") {
            req = req.header("Authorization", format!("Bearer {t}"));
        }
    }
    emit_progress(
        app,
        ProgressPayload {
            codename: codename.to_string(),
            phase: "download".into(),
            message: format!("Downloading {url}"),
            bytes_received: Some(0),
            bytes_total: None,
        },
    );
    if cancel.is_requested() {
        return Err(CANCELLED.into());
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Download failed HTTP {} for {url}", res.status()));
    }
    let total = res.content_length().or(expected_size);
    let mut file = File::create(dest).map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut received: u64 = 0;
    while let Some(chunk) = stream.next().await {
        if cancel.is_requested() {
            return Err(CANCELLED.into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        emit_progress(
            app,
            ProgressPayload {
                codename: codename.to_string(),
                phase: "download".into(),
                message: "Downloading…".into(),
                bytes_received: Some(received),
                bytes_total: total,
            },
        );
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(received)
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry
            .enclosed_name()
            .ok_or_else(|| "Unsafe path in zip".to_string())?
            .to_path_buf();
        let out = dest.join(&name);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&out).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            if let Some(mode) = entry.unix_mode() {
                use std::os::unix::fs::PermissionsExt;
                // Preserve ordinary permissions, never archive setuid/setgid bits.
                fs::set_permissions(&out, fs::Permissions::from_mode(mode & 0o777))
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn extract_7z(archive: &Path, dest: &Path) -> Result<(), String> {
    sevenz_rust::decompress_file(archive, dest).map_err(|e| e.to_string())
}

fn find_7z_binary(app: &AppHandle) -> Option<PathBuf> {
    if let Some(path) = bundled_7z_path(app) {
        return Some(path);
    }
    let names: &[&str] = if cfg!(windows) {
        &["7zz", "7z", "7za", "7z.exe", "7za.exe"]
    } else {
        &["7zz", "7z", "7za"]
    };
    for name in names {
        if let Ok(path) = which_in_path(name) {
            return Some(path);
        }
    }
    let candidates = [
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if cfg!(windows) && p.is_file() {
            return Some(p);
        }
    }
    None
}

fn which_in_path(name: &str) -> Result<PathBuf, ()> {
    let path = std::env::var_os("PATH").ok_or(())?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(())
}

fn extract_with_7z(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    let bin = find_7z_binary(app).ok_or_else(|| {
        "7-Zip is required to extract .rar/.7z archives. Install 7-Zip or use a .zip release."
            .to_string()
    })?;
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(bin);
    configure_headless(&mut cmd);
    let status = cmd
        .args([
            "x",
            "-y",
            &format!("-o{}", dest.display()),
            &archive.display().to_string(),
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("7-Zip extraction failed with status {status}"));
    }
    Ok(())
}

fn extract_archive(app: &AppHandle, archive: &Path, dest: &Path, ext: &str) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    match ext {
        "zip" => extract_zip(archive, dest),
        "7z" => extract_7z(archive, dest).or_else(|_| extract_with_7z(app, archive, dest)),
        "rar" => extract_with_7z(app, archive, dest),
        other => Err(format!("Unsupported archive format: {other}")),
    }
}

fn unwrap_single_root(dir: &Path) -> Result<(), String> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    if entries.len() != 1 {
        return Ok(());
    }
    let only = entries.remove(0);
    if !only.is_dir() {
        return Ok(());
    }
    let name = only
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    // GitHub zipballs are typically repo-ref folders.
    let staging = dir.join("__unwrap_tmp__");
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    fs::rename(&only, &staging).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&staging).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dir.join(entry.file_name());
        fs::rename(&from, &to).map_err(|e| {
            // Cross-device fallback
            if copy_recursive(&from, &to).is_ok() {
                let _ = fs::remove_dir_all(&from);
                return "".to_string();
            }
            e.to_string()
        })?;
    }
    let _ = fs::remove_dir_all(&staging);
    let _ = name;
    Ok(())
}

fn copy_recursive(from: &Path, to: &Path) -> Result<(), String> {
    if from.is_dir() {
        fs::create_dir_all(to).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(from, to).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn strip_setup_exes(root: &Path) -> Result<(), String> {
    fn walk(dir: &Path) -> Result<(), String> {
        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                walk(&path)?;
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if name.starts_with("setup-") && name.ends_with(".exe") {
                let _ = fs::remove_file(&path);
            }
        }
        Ok(())
    }
    walk(root)
}

fn strip_git_dirs(root: &Path) -> Result<(), String> {
    fn walk(dir: &Path) -> Result<(), String> {
        let entries: Vec<_> = fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .collect();
        for entry in entries {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".git" || name.starts_with(".git") {
                if path.is_dir() {
                    let _ = fs::remove_dir_all(&path);
                } else {
                    let _ = fs::remove_file(&path);
                }
                continue;
            }
            if path.is_dir() {
                walk(&path)?;
            }
        }
        Ok(())
    }
    walk(root)
}

#[tauri::command]
pub async fn acquire_mod(
    app: AppHandle,
    input: AcquireModInput,
    cancel_state: State<'_, AcquireCancelFlag>,
) -> Result<AcquireModResult, String> {
    let cancel = AcquireCancelFlag(Arc::clone(&cancel_state.0));
    cancel.clear();

    let codename = input.codename.trim().to_string();
    validate_folder_name(&codename)?;
    let download = PathBuf::from(input.download_dir.trim());
    if download.as_os_str().is_empty() {
        return Err("Mods download directory is not set".into());
    }
    if !download.is_dir() {
        fs::create_dir_all(&download).map_err(|e| e.to_string())?;
    }

    let remote = &input.remote;
    let mut download_url = remote
        .download_url
        .clone()
        .ok_or_else(|| "Remote probe has no download URL".to_string())?;
    let ext = remote
        .extension
        .clone()
        .unwrap_or_else(|| "zip".into())
        .to_ascii_lowercase();

    // Fix main→master (or confirm custom branch) for branch zipballs at acquire time.
    if remote.strategy == "github_zipball_branch" {
        if let (Some(owner), Some(repo)) = (remote.owner.as_deref(), remote.repo.as_deref()) {
            let preferred = remote.zipball_ref.as_deref().unwrap_or("main");
            if let Ok(u) =
                resolve_github_branch_zipball(owner, repo, preferred, input.github_token.as_deref())
                    .await
            {
                download_url = u;
            }
        }
    }

    emit_progress(
        &app,
        ProgressPayload {
            codename: codename.clone(),
            phase: "prepare".into(),
            message: "Preparing download…".into(),
            bytes_received: None,
            bytes_total: None,
        },
    );

    if cancel.is_requested() {
        return Err(CANCELLED.into());
    }

    let staging_parent = download.join(".ie-acquire-tmp");
    fs::create_dir_all(&staging_parent).map_err(|e| e.to_string())?;
    let work = staging_parent.join(format!("{codename}-{}", std::process::id()));
    if work.exists() {
        fs::remove_dir_all(&work).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;

    let archive_path = work.join(format!("payload.{ext}"));
    let extract_dir = work.join("extract");
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

    let result = async {
        let size = download_to_file(
            &app,
            &codename,
            &download_url,
            &archive_path,
            input.github_token.as_deref(),
            &cancel,
            remote.size_bytes,
        )
        .await?;

        if cancel.is_requested() {
            return Err(CANCELLED.into());
        }

        emit_progress(
            &app,
            ProgressPayload {
                codename: codename.clone(),
                phase: "extract".into(),
                message: "Extracting archive…".into(),
                bytes_received: Some(size),
                bytes_total: Some(size),
            },
        );

        extract_archive(&app, &archive_path, &extract_dir, &ext)?;
        let _ = unwrap_single_root(&extract_dir);
        strip_setup_exes(&extract_dir)?;
        strip_git_dirs(&extract_dir)?;

        if cancel.is_requested() {
            return Err(CANCELLED.into());
        }

        // Remove existing target (CI match), then move extract → codename.
        if let Some(existing) = find_subdir_ci(&download, &codename)? {
            let old = download.join(&existing);
            ensure_under_parent(&download, &old)?;
            fs::remove_dir_all(&old).map_err(|e| e.to_string())?;
        }

        let target = download.join(&codename);
        ensure_under_parent(&download, &target)?;
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
        }

        emit_progress(
            &app,
            ProgressPayload {
                codename: codename.clone(),
                phase: "install".into(),
                message: "Installing into mods folder…".into(),
                bytes_received: Some(size),
                bytes_total: Some(size),
            },
        );

        if fs::rename(&extract_dir, &target).is_err() {
            copy_recursive(&extract_dir, &target)?;
        }

        emit_progress(
            &app,
            ProgressPayload {
                codename: codename.clone(),
                phase: "done".into(),
                message: "Done".into(),
                bytes_received: Some(size),
                bytes_total: Some(size),
            },
        );

        Ok(AcquireModResult {
            size_bytes: Some(size),
        })
    }
    .await;

    // Always clean staging (success leaves archive leftovers; cancel/fail leave partial downloads).
    let _ = fs::remove_dir_all(&work);

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn zip_extraction_preserves_execute_bits_without_setuid() {
        use std::io::Write;
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let archive = root.path().join("mod.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive).unwrap());
        writer
            .start_file(
                "helper",
                zip::write::SimpleFileOptions::default().unix_permissions(0o755),
            )
            .unwrap();
        writer.write_all(b"#!/bin/sh\nexit 0\n").unwrap();
        writer.finish().unwrap();
        let dest = root.path().join("out");
        extract_zip(&archive, &dest).unwrap();
        assert_eq!(
            fs::metadata(dest.join("helper"))
                .unwrap()
                .permissions()
                .mode()
                & 0o7777,
            0o755
        );
    }

    #[test]
    fn absolutize_github_href_relative_and_absolute() {
        assert_eq!(
      absolutize_github_href(
        "/ColossusChang/VoicesVoicesExtravaganza/releases/download/v1.1/VoicesVoicesExtravaganza.zip"
      )
      .as_deref(),
      Some(
        "https://github.com/ColossusChang/VoicesVoicesExtravaganza/releases/download/v1.1/VoicesVoicesExtravaganza.zip"
      )
    );
        assert_eq!(
            absolutize_github_href("https://github.com/o/r/releases/download/v1/a.zip").as_deref(),
            Some("https://github.com/o/r/releases/download/v1/a.zip")
        );
        assert_eq!(absolutize_github_href("javascript:alert(1)"), None);
    }

    #[test]
    fn pick_release_download_asset_prefers_relative_assets_and_size() {
        let html = r#"
      <a href="/ColossusChang/VoicesVoicesExtravaganza/archive/refs/tags/v1.1.zip">Source</a>
      <a href="/ColossusChang/VoicesVoicesExtravaganza/releases/download/v1.1/small.zip">s</a>
      12 MB
      <a href="/ColossusChang/VoicesVoicesExtravaganza/releases/download/v1.1/VoicesVoicesExtravaganza.zip">mod</a>
      978 MB
    "#;
        let (url, ext, size) = pick_release_download_asset(html).expect("asset");
        assert_eq!(ext, "zip");
        assert!(url.ends_with("/VoicesVoicesExtravaganza.zip"), "{url}");
        assert!(url.starts_with("https://github.com/"));
        assert!(size.unwrap_or(0) > 100_000_000, "{size:?}");
    }

    #[test]
    fn pick_release_download_asset_ignores_source_archive_only() {
        let html = r#"
      <a href="/o/r/archive/refs/tags/v1.zip">Source code (zip)</a>
    "#;
        assert!(pick_release_download_asset(html).is_none());
    }

    #[test]
    fn parses_g3_metadata_and_linux_asset() {
        let page = r#"
          <h1>Amber v10</h1>
          <p>By <a href="/profile/1-meira/">Meira</a></p>
          <a href="https://gibberlings3.github.io/readme-amber.html">View the Readme</a>
          <dl><dt>Updated</dt><dd>May 7, 2025</dd><dt>File Size</dt><dd>116.18 MB</dd></dl>
        "#;
        let meta = g3_page_meta_from_html(page);
        assert_eq!(meta.name, "Amber v10");
        assert_eq!(meta.author, "Meira");
        assert_eq!(meta.release, "2025-05-07");
        assert_eq!(
            meta.readme,
            "https://gibberlings3.github.io/readme-amber.html"
        );

        let downloads = r#"
          <h4>amber-v10.exe</h4><p>39.49 MB</p>
          <a href="?confirm=1&amp;do=download&amp;r=7026&amp;t=1">Download</a>
          <h4>mac-amber-v10.zip</h4><p>39.23 MB</p>
          <a href="?confirm=1&amp;do=download&amp;r=7027&amp;t=1">Download</a>
          <h4>lin-amber-v10.zip</h4><p>37.46 MB</p>
          <a href="?confirm=1&amp;do=download&amp;r=7028&amp;t=1">Download</a>
        "#;
        let (url, size) = g3_linux_asset_from_html(
            downloads,
            "https://www.gibberlings3.net/files/file/685-amber/?do=download",
        )
        .expect("linux asset");
        assert!(url.contains("r=7028"), "{url}");
        assert_eq!(size, 39_279_657);
    }

    #[test]
    fn recognizes_direct_archive_from_headers_or_final_url() {
        let url = reqwest::Url::parse("https://example.com/files/mod.zip").unwrap();
        assert_eq!(
            archive_ext_from_response(&url, None, Some("application/octet-stream")),
            Some("zip".into())
        );
        let opaque = reqwest::Url::parse("https://example.com/downloaditm5").unwrap();
        assert_eq!(
            archive_ext_from_response(
                &opaque,
                Some("attachment; filename=SomeMod-v2.7z"),
                Some("application/octet-stream")
            ),
            Some("7z".into())
        );
        assert_eq!(
            same_site_referer("https://www.sentrizeal.com/downloaditm5").as_deref(),
            Some("https://www.sentrizeal.com/")
        );
    }
}
