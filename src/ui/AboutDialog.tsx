import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { APP_VERSION } from '../lib/appVersion'
import { openExternalUrl } from '../lib/desktop/openExternalUrl'
import { useBackdropDismiss } from './backdropDismiss'
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

  if (!open) return null

  return (
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
        <p className="about-disclaimer">
          Unofficial fan tool. Not affiliated with Beamdog, BioWare, or Wizards
          of the Coast.
        </p>
      </div>
    </div>
  )
}
