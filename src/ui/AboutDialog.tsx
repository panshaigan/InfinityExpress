import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { APP_VERSION } from '../lib/appVersion'
import { openExternalUrl } from '../lib/desktop/openExternalUrl'
import { useBackdropDismiss } from './backdropDismiss'

interface Props {
  open: boolean
  onClose: () => void
}

const REPO_URL = 'https://github.com/panshaigan/InfinityExpress'

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

export function AboutDialog({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)

  useEffect(() => {
    if (!open) return
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
          Version {APP_VERSION} · by shaigan
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
