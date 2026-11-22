//! Public GitLab.com project metadata and archive selection.

use super::{
    ext_from_name, http_client, is_archive_ext, normalize_track, parse_iso_date,
    wants_asset_download, ModPageMeta, RemoteProbeResult,
};
use regex::Regex;
use reqwest::{StatusCode, Url};
use serde_json::Value;

pub(super) struct Project {
    namespace: String,
    slug: String,
    api: Url,
}

struct Archive {
    url: Url,
    extension: String,
    size: Option<u64>,
}

pub(super) fn is_host(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("gitlab.com" | "www.gitlab.com"))
}

impl Project {
    pub(super) fn from_url(url: &Url) -> Option<Self> {
        if !is_host(url) {
            return None;
        }
        let path = url.path().trim_matches('/');
        let (project, page) = path.split_once("/-/").unwrap_or((path, ""));
        let route = page.split('/').next().unwrap_or_default();
        if project.starts_with("api/")
            || matches!(route, "archive" | "raw" | "uploads" | "package_files")
            || (route == "jobs" && page.contains("/artifacts"))
            || (route == "releases" && page.contains("/downloads/"))
        {
            return None;
        }
        let (namespace, slug) = project.rsplit_once('/')?;
        let slug = slug.strip_suffix(".git").unwrap_or(slug);
        if slug.is_empty()
            || !namespace.split('/').chain([slug]).all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
            })
        {
            return None;
        }
        let mut api = Url::parse("https://gitlab.com/api/v4/projects").ok()?;
        api.path_segments_mut()
            .ok()?
            .push(&format!("{namespace}/{slug}"));
        Some(Self {
            namespace: namespace.into(),
            slug: slug.into(),
            api,
        })
    }

    fn endpoint(&self, segments: &[&str]) -> Url {
        let mut url = self.api.clone();
        url.path_segments_mut()
            .expect("GitLab API URL has a path")
            .extend(segments);
        url
    }

    pub(super) async fn page_meta(&self) -> Result<ModPageMeta, String> {
        let project = get_json(self.api.clone())
            .await?
            .ok_or_else(|| "GitLab project is missing or is not public".to_string())?;
        Ok(ModPageMeta {
            name: project["name"].as_str().unwrap_or_default().into(),
            readme: String::new(),
            author: project
                .pointer("/namespace/name")
                .and_then(Value::as_str)
                .unwrap_or(&self.namespace)
                .into(),
            release: String::new(),
            size_bytes: None,
        })
    }

    pub(super) async fn probe(
        &self,
        track: &str,
        download: &str,
    ) -> Result<RemoteProbeResult, String> {
        let track = normalize_track(track);
        if !track.is_empty() {
            let branch = (track != "main").then_some(track.as_str());
            return self.probe_branch(branch).await;
        }
        let asset = wants_asset_download(download, &track);
        match get_json(self.endpoint(&["releases", "permalink", "latest"])).await? {
            Some(release) => self.release_result(&release, asset),
            None if asset => {
                Err("GitLab project has no public release with downloadable assets".into())
            }
            None => self.probe_branch(None).await,
        }
    }

    async fn probe_branch(&self, branch: Option<&str>) -> Result<RemoteProbeResult, String> {
        let (url, commit_path) = if let Some(name) = branch {
            (self.endpoint(&["repository", "branches", name]), "/commit")
        } else {
            let mut url = self.endpoint(&["repository", "commits"]);
            url.query_pairs_mut().append_pair("per_page", "1");
            (url, "/0")
        };
        let response = get_json(url).await?;
        let commit = response
            .as_ref()
            .and_then(|json| json.pointer(commit_path))
            .ok_or_else(|| match branch {
                Some(name) => {
                    format!("GitLab branch \"{name}\" was not found in the public project")
                }
                None => "GitLab project has no accessible default branch commits".into(),
            })?;
        self.branch_result(commit)
    }

    fn branch_result(&self, commit: &Value) -> Result<RemoteProbeResult, String> {
        let sha = commit["id"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "GitLab branch response has no commit ID".to_string())?;
        let release = ["authored_date", "committed_date"]
            .into_iter()
            .find_map(|field| parse_iso_date(commit[field].as_str()?))
            .unwrap_or_default();
        Ok(self.result(
            sha.chars().take(7).collect(),
            release,
            self.source_archive(sha),
            Some(sha.into()),
        ))
    }

    fn release_result(
        &self,
        release: &Value,
        use_asset: bool,
    ) -> Result<RemoteProbeResult, String> {
        let tag = release["tag_name"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "GitLab release response has no tag name".to_string())?;
        let date = release["released_at"]
            .as_str()
            .and_then(parse_iso_date)
            .unwrap_or_default();
        if use_asset {
            let archive = release_asset(release).ok_or_else(|| {
                "Download=asset but no .zip/.7z/.rar asset or release description link was found on GitLab".to_string()
            })?;
            return Ok(self.result(tag.into(), date, archive, None));
        }
        let reference = release
            .pointer("/commit/id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(tag);
        Ok(self.result(
            tag.into(),
            date,
            self.source_archive(reference),
            Some(reference.into()),
        ))
    }

    fn source_archive(&self, reference: &str) -> Archive {
        let mut url = self.endpoint(&["repository", "archive.zip"]);
        url.query_pairs_mut().append_pair("sha", reference);
        Archive {
            url,
            extension: "zip".into(),
            size: None,
        }
    }

    fn result(
        &self,
        version: String,
        release: String,
        archive: Archive,
        reference: Option<String>,
    ) -> RemoteProbeResult {
        RemoteProbeResult {
            version,
            release,
            download_url: Some(archive.url.to_string()),
            extension: Some(archive.extension),
            strategy: if reference.is_some() {
                "gitlab_source"
            } else {
                "gitlab_asset"
            }
            .into(),
            size_bytes: archive.size,
            size_is_estimate: false,
            used_scrape_fallback: false,
            rate_limited: false,
            zipball_ref: reference,
            owner: Some(self.namespace.clone()),
            repo: Some(self.slug.clone()),
        }
    }
}

async fn get_json(url: Url) -> Result<Option<Value>, String> {
    let response = http_client()?
        .get(url.clone())
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|err| format!("GitLab request failed: {err}"))?;
    let status = response.status();
    if status == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(format!("GitLab returned HTTP {status} for {url}"));
    }
    response
        .json()
        .await
        .map(Some)
        .map_err(|err| format!("Could not read GitLab response for {url}: {err}"))
}

fn release_asset(release: &Value) -> Option<Archive> {
    if let Some(links) = release.pointer("/assets/links").and_then(Value::as_array) {
        if let Some(archive) = links.iter().find_map(|link| {
            let name = link["name"].as_str().unwrap_or_default();
            let size = link["size"].as_u64().filter(|size| *size > 0);
            ["url", "direct_asset_url"]
                .into_iter()
                .find_map(|field| asset_archive(link[field].as_str()?, name, size))
        }) {
            return Some(archive);
        }
    }
    let description = release["description"].as_str()?;
    let urls = Regex::new(r#"(?i)https?://[^\s)"'<>]+"#).ok()?;
    let archive = urls
        .find_iter(description)
        .find_map(|link| asset_archive(link.as_str().trim_end_matches([',', '.']), "", None));
    archive
}

fn asset_archive(raw_url: &str, name: &str, size: Option<u64>) -> Option<Archive> {
    let url = Url::parse(raw_url).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let extension = [url.path(), name]
        .into_iter()
        .find_map(|name| ext_from_name(name).filter(|ext| is_archive_ext(ext)))?;
    Some(Archive {
        url,
        extension,
        size,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn project() -> Project {
        let url =
            Url::parse("https://www.gitlab.com/group/subgroup/mod.git/-/releases/v2").unwrap();
        Project::from_url(&url).unwrap()
    }

    #[test]
    fn encodes_nested_project_and_custom_branch_as_single_api_segments() {
        let url = project().endpoint(&["repository", "branches", "release/beta"]);
        assert_eq!(
            url.as_str(),
            "https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fmod/repository/branches/release%2Fbeta"
        );
    }

    #[test]
    fn direct_archives_and_other_hosts_are_not_project_urls() {
        for url in [
            "https://gitlab.com/group/mod/-/archive/v1/mod-v1.zip",
            "https://gitlab.com/group/mod/-/jobs/artifacts/main/download?job=build",
            "https://gitlab.com/group/mod/-/releases/v1/downloads/mod.zip",
            "https://gitlab.com/api/v4/projects/123/repository/archive.zip",
            "https://example.test/gitlab.com/group/mod",
        ] {
            assert!(
                Project::from_url(&Url::parse(url).unwrap()).is_none(),
                "{url}"
            );
        }
    }

    #[test]
    fn source_downloads_pin_the_commit_and_report_its_matching_metadata() {
        let project = project();
        let commit = json!({
            "id": "abc123456789",
            "authored_date": "2026-03-14T23:55:00-04:00"
        });
        let branch = project.branch_result(&commit).unwrap();
        assert_eq!(branch.version, "abc1234");
        assert_eq!(branch.release, "2026-03-15");
        assert_eq!(branch.extension.as_deref(), Some("zip"));
        assert_eq!(
            branch.download_url.as_deref(),
            Some("https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fmod/repository/archive.zip?sha=abc123456789")
        );

        let release = project
            .release_result(
                &json!({
                    "tag_name": "v2",
                    "released_at": "2026-04-02T08:00:00Z",
                    "commit": commit
                }),
                false,
            )
            .unwrap();
        assert_eq!(release.version, "v2");
        assert_eq!(release.release, "2026-04-02");
        assert_eq!(release.download_url, branch.download_url);
    }

    #[test]
    fn asset_mode_uses_archive_links_then_release_notes_and_skips_generated_sources() {
        let project = project();
        let mut release = json!({
            "tag_name": "v2",
            "released_at": "2026-04-02T08:00:00Z",
            "assets": {
                "sources": [{"format": "zip", "url": "https://gitlab.com/group/subgroup/mod/-/archive/v2/mod-v2.zip"}],
                "links": [
                    {"name": "Screenshots", "url": "https://example.test/preview.png"},
                    {"name": "Mod.7z", "url": "https://gitlab.com/group/subgroup/mod/-/package_files/7/download"}
                ]
            }
        });
        let asset = project.release_result(&release, true).unwrap();
        assert_eq!(asset.version, "v2");
        assert_eq!(asset.release, "2026-04-02");
        assert_eq!(asset.extension.as_deref(), Some("7z"));
        assert_eq!(
            asset.download_url.as_deref(),
            Some("https://gitlab.com/group/subgroup/mod/-/package_files/7/download")
        );

        release["assets"]["links"] = json!([]);
        assert!(project.release_result(&release, true).is_err());
        release["description"] = json!("[Get the archive](https://example.test/mod.rar?build=2)");
        let notes_asset = project.release_result(&release, true).unwrap();
        assert_eq!(notes_asset.extension.as_deref(), Some("rar"));
        assert_eq!(
            notes_asset.download_url.as_deref(),
            Some("https://example.test/mod.rar?build=2")
        );
    }
}
