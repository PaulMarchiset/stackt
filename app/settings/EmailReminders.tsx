'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { renderDigest } from '@/lib/email/template';
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
 * The single control center for the daily reminder email. Everything lives here:
 * master on/off, which projects to include (editable — the header bell is just a
 * shortcut for the same flag), the subject, which sections to show, the horizon,
 * and a live preview rendered with the very engine the cron uses.
 */
export default function EmailReminders({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<ProjRow[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [enabled, setEnabled] = useState(DEFAULT_EMAIL_PREFS.enabled);
  const [subject, setSubject] = useState('');
  const [horizon, setHorizon] = useState(DEFAULT_EMAIL_PREFS.horizon_days);
  const [sections, setSections] = useState<EmailSection[]>(DEFAULT_EMAIL_PREFS.sections);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [schemaError, setSchemaError] = useState(false);

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
    if (error) setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, remind: !next } : p)));
  }

  function toggleSection(key: EmailSection) {
    setSections((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));
  }

  async function savePrefs() {
    setBusy(true); setMsg('');
    const { error } = await supabase.from('email_prefs').upsert({
      user_id: userId,
      enabled,
      subject: subject.trim() || null,
      horizon_days: Math.max(0, Math.min(30, Number(horizon) || 0)),
      sections,
      updated_at: new Date().toISOString()
    });
    setBusy(false);
    setMsg(error ? 'Échec de l’enregistrement — réessaie.' : 'Enregistré ✓');
  }

  const reminded = useMemo(() => projects.filter((p) => p.remind), [projects]);

  // Live preview via the exact engine the cron uses.
  const preview = useMemo(() => {
    const prefs: EmailPrefs = {
      user_id: userId, enabled, subject: subject.trim() || null,
      horizon_days: Math.max(0, Math.min(30, Number(horizon) || 0)), sections
    };
    return renderDigest({ projects: reminded as Project[], cards, prefs, today: parisToday() });
  }, [userId, enabled, subject, horizon, sections, reminded, cards]);

  if (loading) return null;

  return (
    <section className="settings-group">
      <div className="settings-group-label">Rappels email</div>

      {schemaError && (
        <div className="settings-warn">
          La base n’est pas encore prête : exécute le script <code>supabase/schema.sql</code> dans
          l’éditeur SQL de Supabase, puis recharge cette page.
        </div>
      )}

      <div className="er-card">
        {/* Master on/off */}
        <div className="er-head">
          <div className="setting-text">
            <div className="setting-title">Email quotidien</div>
            <div className="setting-desc">Un seul email chaque matin à 8h, avec les tâches des projets choisis.</div>
          </div>
          <button className={'switch' + (enabled ? ' on' : '')} role="switch" aria-checked={enabled}
            aria-label="Email quotidien" onClick={() => setEnabled(!enabled)}><span /></button>
        </div>

        <div className={'er-body' + (enabled ? '' : ' off')} aria-hidden={!enabled}>
          {/* Projects */}
          <div className="er-field">
            <div className="er-sub">Projets à inclure</div>
            {projects.length === 0 ? (
              <div className="er-empty">Aucun projet pour l’instant.</div>
            ) : (
              <div className="er-projlist">
                {projects.map((p) => (
                  <div className="er-proj" key={p.id}>
                    <span className="er-proj-name">{p.name || 'Sans nom'}</span>
                    <button className={'switch' + (p.remind ? ' on' : '')} role="switch" aria-checked={p.remind}
                      aria-label={`Inclure ${p.name}`} onClick={() => toggleProject(p.id, !p.remind)}><span /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="er-tip">Astuce : tu peux aussi (dés)activer un projet depuis la cloche 🔔 de son tableau.</div>
          </div>

          {/* Content */}
          <div className="er-field">
            <div className="er-sub">Contenu du mail</div>

            <label className="er-label" htmlFor="er-subject">Objet</label>
            <input id="er-subject" className="settings-input" value={subject} placeholder="Rappel Stackt — {date}"
              onChange={(e) => setSubject(e.target.value)} />

            <label className="er-label" style={{ marginTop: 6 }}>Sections</label>
            <div className="er-seg" role="group" aria-label="Sections incluses">
              {EMAIL_SECTIONS.map((s) => {
                const on = sections.includes(s.key);
                return (
                  <button type="button" key={s.key} className={'er-pill' + (on ? ' on' : '')}
                    aria-pressed={on} onClick={() => toggleSection(s.key)}>
                    <svg viewBox="0 0 24 24" className="er-check"><path d="M5 13l4 4L19 7" /></svg>
                    {s.label}
                  </button>
                );
              })}
            </div>

            <label className="er-label" htmlFor="er-horizon" style={{ marginTop: 6 }}>Horizon « À venir »</label>
            <div className="er-inline">
              <input id="er-horizon" className="settings-input" type="number" min={0} max={30} value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))} />
              <span className="er-tip">jours à l’avance</span>
            </div>
          </div>

          {/* Live preview */}
          <div className="er-field">
            <div className="er-sub">Aperçu</div>
            <div className="er-preview">
              <div className="er-preview-bar">
                <span className="er-preview-label">Objet</span>
                <b>{subject.trim() || `Rappel Stackt — ${parisToday()}`}</b>
              </div>
              {preview ? (
                <iframe className="er-frame" title="Aperçu du mail" srcDoc={preview.html} />
              ) : (
                <div className="er-preview-empty">
                  Rien à envoyer avec ces réglages aujourd’hui (aucune tâche dans les sections choisies).
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="er-foot">
          <button className="btn solid" onClick={savePrefs} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {msg && <span className="settings-msg">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
