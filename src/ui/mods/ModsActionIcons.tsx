/** Compact action glyphs for the Mods toolbar and detail pane. */

export function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.5a.75.75 0 0 1 .75.75v6.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.22 2.22V2.25A.75.75 0 0 1 8 1.5ZM3 12.25a.75.75 0 0 0 0 1.5h10a.75.75 0 0 0 0-1.5H3Z"
      />
    </svg>
  )
}

export function CheckUpdatesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.5 8a5.5 5.5 0 0 1-9.3 4.05.75.75 0 1 1 1.06-1.06A4 4 0 1 0 5.2 5.2L6.75 6.75H3.25a.75.75 0 0 1-.75-.75V2.5a.75.75 0 0 1 1.5 0v1.44A5.5 5.5 0 0 1 13.5 8Z"
      />
    </svg>
  )
}

export function RemoveFromDiskIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2.5h4a.5.5 0 0 1 .5.5v1H5.5V3a.5.5 0 0 1 .5-.5Zm-2 2h8l-.55 8.1A1.5 1.5 0 0 1 9.96 14H6.04a1.5 1.5 0 0 1-1.49-1.4L4 4.5Zm1.51 1.5.45 6.6h4.08l.45-6.6H5.51Z"
      />
      <path
        fill="currentColor"
        d="M2.25 4.5h11.5a.75.75 0 0 0 0-1.5H2.25a.75.75 0 0 0 0 1.5Z"
      />
    </svg>
  )
}

export function ExportCsvIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 1.5h6.2L13.5 5.8V13A1.5 1.5 0 0 1 12 14.5H3A1.5 1.5 0 0 1 1.5 13V3A1.5 1.5 0 0 1 3 1.5Zm0 1a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V6.2L8.8 2.5H3Zm1.5 3h5v1.25h-5V5.5Zm0 2.5h5V9.25h-5V8Zm0 2.5h3.5v1.25H4.5V10.5Z"
      />
    </svg>
  )
}

export function AddModIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"
      />
    </svg>
  )
}

/** Funnel / filter — “only mods required by selection”. */
export function OnlyNeededIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.25 2.5h11.5a.75.75 0 0 1 .53 1.28L9.5 8.56v3.69a.75.75 0 0 1-1.17.62l-2-1.25A.75.75 0 0 1 6 10.94V8.56L1.72 3.78A.75.75 0 0 1 2.25 2.5Zm1.6 1.5 3.43 3.86a.75.75 0 0 1 .17.48v2.2l.6.38V8.34a.75.75 0 0 1 .17-.48L11.65 4H3.85Z"
      />
    </svg>
  )
}

export function EditModIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.8 1.6a1.6 1.6 0 0 1 2.26 2.26l-.4.4-2.26-2.26.4-.4ZM2.5 11.5 10.9 3.1l2.26 2.26L4.76 13.76H2.5V11.5Z"
      />
    </svg>
  )
}

export function DeleteFromCatalogIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2.5h4a.5.5 0 0 1 .5.5v1H5.5V3a.5.5 0 0 1 .5-.5Zm-2 2h8l-.55 8.1A1.5 1.5 0 0 1 9.96 14H6.04a1.5 1.5 0 0 1-1.49-1.4L4 4.5Z"
      />
    </svg>
  )
}

export function ClearFiltersIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      className="filter-clear-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M3.5 3.5 8 8l4.5-4.5.9.9L8.9 8.9l4.5 4.5-.9.9L8 9.8l-4.5 4.5-.9-.9 4.5-4.5L2.6 4.4z"
      />
    </svg>
  )
}
