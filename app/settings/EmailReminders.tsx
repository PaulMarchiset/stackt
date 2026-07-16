'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { defaultSubject, renderDigest } from '@/lib/email/template';
import { localTimeZone, sendWindow, versionTheme } from '@/lib/util';
import {
  DEFAULT_EMAIL_PREFS, EMAIL_SECTIONS,
  type Card, type EmailPrefs, type EmailSection, type Project
} from '@/lib/types';

type ProjRow = Pick<Project, 'id' | 'name' | 'remind'>;

/* Today in Europe/Paris (matches the cron's reference), as YYYY-MM-DD. */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/**
 * The control center for the daily reminder email: master on/off, which projects
 * to include (the header bell is just a shortcut for the same flag), the
 * subject, which sections to show and how far "upcoming" reaches — with a live
 * preview beside them rendered by the very engine the cron uses.
 */
export default function EmailReminders({
  userId, userEmail, onToast
}: {
  userId: string; userEmail: string; onToast: (msg: string, error?: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<ProjRow[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [enabled, setEnabled] = useState(DEFAULT_EMAIL_PREFS.enabled);
  const [subject, setSubject] = useState('');
  const [horizon, setHorizon] = useState(DEFAULT_EMAIL_PREFS.horizon_days);
  const [sections, setSections] = useState<EmailSection[]>(DEFAULT_EMAIL_PREFS.sections);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [schemaError, setSchemaError] = useState(false);
  /* Read from the device, so it can only be known after mount (the server has
     no idea what timezone the reader is in). */
  const [tz, setTz] = useState<string | null>(null);

  useEffect(() => setTz(localTimeZone()), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [projRes, prefRes, cardRes] = await Promise.all([
        supabase.from('projects').select('id, name, remind').order('position').order('created_at'),
        supabase.from('email_prefs').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('cards').select('id, project_id, title, target_date, done').eq('done', false)
      ]);
      if (!alive) return;
      if (projRes.error || prefRes.error) setSchemaError(true);
      setProjects((projRes.data as ProjRow[]) || []);
      setCards((cardRes.data as Card[]) || []);
      const pref = prefRes.data;
      if (pref) {
        setEnabled(pref.enabled);
        setSubject(pref.subject || '');
        setHorizon(pref.horizon_days);
        setSections((pref.sections as EmailSection[]) || DEFAULT_EMAIL_PREFS.sections);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [supabase, userId]);

  async function toggleProject(id: string, next: boolean) {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, remind: next } : p)));
    const { error } = await supabase.from('projects').update({ remind: next }).eq('id', id);
    if (error) {
      setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, remind: !next } : p)));
      onToast('Could not update that project — try again.', true);
    }
  }

  function toggleSection(key: EmailSection) {
    setSections((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));
  }

  async function savePrefs() {
    setBusy(true);
    const { error } = await supabase.from('email_prefs').upsert({
      user_id: userId,
      enabled,
      subject: subject.trim() || null,
      horizon_days: Math.max(0, Math.min(30, Number(horizon) || 0)),
      sections,
      updated_at: new Date().toISOString()
    });
    setBusy(false);
    onToast(error ? 'Could not save — try again.' : 'Reminder settings saved', !!error);
  }

  const today = parisToday();
  const reminded = useMemo(() => projects.filter((p) => p.remind), [projects]);
  const win = useMemo(() => (tz ? sendWindow(tz) : null), [tz]);

  /* Open cards per project — powers the counts and the "empty" flag. */
  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.project_id, (m.get(c.project_id) || 0) + 1);
    return m;
  }, [cards]);

  // Live preview via the exact engine the cron uses.
  const preview = useMemo(() => {
    const prefs: EmailPrefs = {
      user_id: userId, enabled, subject: subject.trim() || null,
      horizon_days: Math.max(0, Math.min(30, Number(horizon) || 0)), sections
    };
    return renderDigest({ projects: reminded as Project[], cards, prefs, today });
  }, [userId, enabled, subject, horizon, sections, reminded, cards, today]);

  if (loading) return <div className="set-card"><div className="set-row"><p className="set-desc">Loading…</p></div></div>;

  const showUpcoming = sections.includes('upcoming');

  return (
    <>
      {schemaError && (
        <div className="set-warn">
          The database isn&apos;t ready yet: run <code>supabase/schema.sql</code> in the Supabase SQL editor,
          then reload this page.
        </div>
      )}

      {/* Master on/off */}
      <div className="set-card" style={{ marginBottom: 20 }}>
        <div className="set-row">
          <div className="set-rowhead">
            <div className="set-rowtext">
              <h3 className="set-h3">Daily email</h3>
              <p className="set-desc">One email every morning with the tasks from the projects you pick.</p>
            </div>
            <button className={'switch' + (enabled ? ' on' : '')} role="switch" aria-checked={enabled}
              aria-label="Daily email" onClick={() => setEnabled(!enabled)}><span /></button>
          </div>
          {win && tz && (
            <div className="set-metarow">
              <span className="set-meta">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                Sent between {win.from} and {win.to}
              </span>
              <span className="set-meta">Your timezone · {tz}</span>
            </div>
          )}
        </div>
      </div>

      <div className={'set-builder' + (enabled ? '' : ' off')} aria-hidden={!enabled}>
        <div className="set-form">
          {/* Projects */}
          <div className="set-card">
            <div className="set-row">
              <span className="set-label">Projects to include</span>
              {projects.length === 0 ? (
                <p className="set-desc">No projects yet.</p>
              ) : (
                <div className="set-projlist">
                  {projects.map((p) => {
                    const n = openCount.get(p.id) || 0;
                    return (
                      <div className={'set-proj card-theme-' + versionTheme(p.name)} key={p.id}>
                        <span className="set-swatch" />
                        <span className="set-proj-name">{p.name || 'Untitled'}</span>
                        <span className="set-proj-count">{n}</span>
                        <span className="set-proj-spacer" />
                        {n === 0 && <span className="set-flag">empty</span>}
                        <button className={'switch' + (p.remind ? ' on' : '')} role="switch" aria-checked={p.remind}
                          aria-label={`Include ${p.name}`} onClick={() => toggleProject(p.id, !p.remind)}><span /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="set-card">
            <div className="set-row">
              <label className="set-label" htmlFor="er-subject">Subject line</label>
              <input id="er-subject" className="set-input mono" value={subject} placeholder={defaultSubject(today)}
                onChange={(e) => setSubject(e.target.value)} />
              <p className="set-hint">Leave it empty to keep the default subject.</p>
            </div>

            <div className="set-row">
              <span className="set-label">Sections to show</span>
              <div className="set-chips" role="group" aria-label="Sections to show">
                {EMAIL_SECTIONS.map((s) => {
                  const on = sections.includes(s.key);
                  return (
                    <button type="button" key={s.key} className="set-chip" data-key={s.key}
                      aria-pressed={on} onClick={() => toggleSection(s.key)}>
                      <span className="dot" />{s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {showUpcoming && (
              <div className="set-row">
                <span className="set-label">Upcoming window</span>
                <div className="set-inline">
                  <div className="set-stepper">
                    <button type="button" aria-label="Fewer days" disabled={horizon <= 0}
                      onClick={() => setHorizon((h) => Math.max(0, h - 1))}>−</button>
                    <span className="val">{horizon}</span>
                    <button type="button" aria-label="More days" disabled={horizon >= 30}
                      onClick={() => setHorizon((h) => Math.min(30, h + 1))}>+</button>
                  </div>
                  <span className="set-unit">days ahead</span>
                </div>
              </div>
            )}
          </div>

          <div className="set-savebar">
            <button className="btn solid" onClick={savePrefs} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="set-preview-wrap">
          <div className="set-pv-top">
            <span className="set-label" style={{ margin: 0 }}>Live preview</span>
            <span className="set-live"><i />Updating</span>
          </div>
          <div className="set-mail">
            <div className="set-mail-chrome"><i /><i /><i /></div>
            <div className="set-mail-subj">
              <div className="k">Subject</div>
              <div className="v">{preview?.subject || subject.trim() || defaultSubject(today)}</div>
            </div>
            {preview ? (
              <iframe className="set-frame" title="Email preview" srcDoc={preview.html} />
            ) : (
              <div className="set-mail-empty">
                Nothing to send with these settings today.<br />Turn on a project or a section.
              </div>
            )}
          </div>
          <p className="set-hint">Sent to <b>{userEmail}</b>.</p>
        </div>
      </div>
    </>
  );
}
