import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { APP_VERSION } from '../lib/appVersion'
import {
  checkForAppUpdate,
  installAppUpdate,
  type AppUpdateCheckResult,
} from '../lib/desktop/appUpdater'
import { openExternalUrl } from '../lib/desktop/openExternalUrl'
import { useBackdropDismiss } from './backdropDismiss'
import { ConfirmDialog } from './ConfirmDialog'
import { useDeveloperMode } from './developerModeContext'
import { useToast } from './toasts/toastContext'

interface Props {
  open: boolean
  onClose: () => void
}

const REPO_URL = 'https://github.com/panshaigan/InfinityExpress'
const AUTHOR_BLOOM_MS = 300

const COMMUNITY_LINKS: { label: string; href: string }[] = [
  {
    label: 'Gibberlings3',
    href: 'https://www.gibberlings3.net/forums/',
  },
  {
    label: 'Beamdog Forums',
    href: 'https://forums.beamdog.com/',
  },
  {
    label: 'Spellhold Studios',
    href: 'https://www.shsforums.net/',
  },
  {
    label: 'Infinity Engine Discord',
    href: 'https://discord.com/invite/0rvJmMgIV5FHQTWT',
  },
]

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e: ReactMouseEvent<HTMLAnchorElement>) => {
        e.preventDefault()
        e.stopPropagation()
        void openExternalUrl(href)
      }}
    >
      {children}
    </a>
  )
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function isSecretModifier(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey
}

export function AboutDialog({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const backdrop = useBackdropDismiss(onClose)
  const { toggleDeveloperMode } = useDeveloperMode()
  const { pushToast } = useToast()
  const [blooming, setBlooming] = useState(false)
  const [updateCheck, setUpdateCheck] = useState<AppUpdateCheckResult | null>(
    null,
  )
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<
    Extract<AppUpdateCheckResult, { status: 'available' }> | null
  >(null)
  const [installingUpdate, setInstallingUpdate] = useState(false)

  useEffect(() => {
    if (!open) {
      setBlooming(false)
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      return
    }
    panelRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  function onAuthorMouseDown(e: ReactMouseEvent<HTMLSpanElement>) {
    if (isSecretModifier(e)) e.preventDefault()
  }

  function onAuthorClick(e: ReactMouseEvent<HTMLSpanElement>) {
    if (!isSecretModifier(e)) return
    e.preventDefault()
    e.stopPropagation()
    const next = toggleDeveloperMode()
    pushToast({
      tone: 'success',
      message: next ? 'Catalog forge unlocked.' : 'Catalog forge sealed.',
    })
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setBlooming(true)
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = window.setTimeout(() => {
      setBlooming(false)
      onClose()
    }, AUTHOR_BLOOM_MS)
  }

  async function onCheckUpdates() {
    setCheckingUpdates(true)
    setUpdateCheck(null)
    try {
      const result = await checkForAppUpdate()
      setUpdateCheck(result)
      if (result.status === 'available') {
        setPendingUpdate(result)
      } else if (result.status === 'current') {
        pushToast({ tone: 'success', message: 'You are on the latest version.' })
      } else if (result.status === 'error') {
        pushToast({ tone: 'error', message: result.message })
      }
    } finally {
      setCheckingUpdates(false)
    }
  }

  async function onConfirmInstallUpdate() {
    if (!pendingUpdate) return
    setInstallingUpdate(true)
    try {
      await installAppUpdate(pendingUpdate.update)
    } catch (err) {
      pushToast({ tone: 'error', message: String(err) })
      setInstallingUpdate(false)
      setPendingUpdate(null)
    }
  }

  function updateStatusLabel(): string | null {
    if (checkingUpdates) return 'Checking for updates…'
    if (updateCheck?.status === 'available') {
      return `Update available: v${updateCheck.version}`
    }
    if (updateCheck?.status === 'current') return 'You are on the latest version.'
    if (updateCheck?.status === 'unavailable') {
      return 'Updates are available in the installed desktop app only.'
    }
    return null
  }

  if (!open) return null

  const statusLabel = updateStatusLabel()

  return (
    <>
      <ConfirmDialog
        open={pendingUpdate != null && !installingUpdate}
        title="Install update?"
        message={
          pendingUpdate
            ? `Download and install v${pendingUpdate.version}? The app will restart when finished.`
            : ''
        }
        confirmLabel="Install update"
        onConfirm={() => {
          void onConfirmInstallUpdate()
        }}
        onCancel={() => setPendingUpdate(null)}
      />
    <div
      className="keyboard-help-backdrop"
      role="presentation"
      {...backdrop}
    >
      <div
        ref={panelRef}
        className="keyboard-help about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="about-dialog-title">iNfinity eXpress</h2>
        </div>
        <p className="about-meta">
          Version {APP_VERSION} · by{' '}
          <span
            className={`about-author-secret${blooming ? ' blooming' : ''}`}
            onMouseDown={onAuthorMouseDown}
            onClick={onAuthorClick}
          >
            shaigan
          </span>
        </p>
        <p className="keyboard-help-lede">
          Plan and order Infinity Engine mod installs — your mod route.
        </p>
        <section className="about-section">
          <h3 className="about-section-title">Updates</h3>
          <p className="about-meta">
            <button
              type="button"
              className="btn secondary"
              disabled={checkingUpdates || installingUpdate}
              onClick={() => {
                void onCheckUpdates()
              }}
            >
              {checkingUpdates ? 'Checking…' : 'Check for updates'}
            </button>
          </p>
          {statusLabel ? <p className="settings-help">{statusLabel}</p> : null}
        </section>
        <section className="about-section">
          <h3 className="about-section-title">Source</h3>
          <ul className="about-link-list">
            <li>
              <ExternalLink href={REPO_URL}>GitHub repository</ExternalLink>
            </li>
          </ul>
        </section>
        <section className="about-section">
          <h3 className="about-section-title">Community</h3>
          <ul className="about-link-list">
            {COMMUNITY_LINKS.map((link) => (
              <li key={link.href}>
                <ExternalLink href={link.href}>{link.label}</ExternalLink>
              </li>
            ))}
          </ul>
        </section>
        <section className="about-section">
          <h3 className="about-section-title">Third-party licenses</h3>
          <p className="about-meta">
            Bundled WeiDU (GPL) and 7-Zip (LGPL) — see their respective project
            sites for license text.
          </p>
        </section>
        <p className="about-disclaimer">
          Unofficial fan tool. Not affiliated with Beamdog, BioWare, or Wizards
          of the Coast.
        </p>
      </div>
    </div>
    </>
  )
}
