'use client';

import { useState } from 'react';
import Modal from '@/app/board/Modal';

/**
 * The two dialog shapes the app actually asks for, so a screen states its
 * question instead of re-assembling a modal body, a hint, an actions row and a
 * pair of useStates every time.
 *
 * <ConfirmDialog> — a statement and a yes/no.
 * <PromptDialog>  — one line of text in, a value out. It owns the draft, so the
 *                   caller keeps one piece of state (open / not open) rather
 *                   than two that have to be initialised in step.
 *
 * Both mount only while open, which is what makes that work: `defaultValue` is
 * read fresh on every open, and there is no stale draft to clear on close.
 */

export function ConfirmDialog({
  title, confirmLabel = 'Confirm', danger, className = 'modal-center', onConfirm, onCancel, children
}: {
  title: string;
  confirmLabel?: string;
  danger?: boolean;
  className?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;   // what is about to happen, in the caller's words
}) {
  return (
    <Modal title={title} className={className} onClose={onCancel}>
      <div className="modal-form">
        <p className="modal-form-hint">{children}</p>
        <div className="edit-actions">
          <div className="meta-spacer" />
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className={'btn ' + (danger ? 'danger-solid' : 'solid')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  title, label, hint, placeholder, defaultValue = '', submitLabel = 'Save',
  required, inputMode, className = 'modal-center', actionsLeft, onSubmit, onCancel
}: {
  title: string;
  label: string;
  hint?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  /* Blank is not an answer: the submit is disabled and Enter does nothing.
     Left off, an empty value is a legitimate one (it clears the field). */
  required?: boolean;
  inputMode?: 'url' | 'email' | 'text';
  className?: string;
  /* Anything that belongs on the left of the actions row, e.g. a link out. */
  actionsLeft?: React.ReactNode;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const ok = !required || !!value.trim();
  const submit = () => { if (ok) onSubmit(value); };

  return (
    <Modal title={title} className={className} onClose={onCancel}>
      <div className="modal-form">
        <label className="modal-form-label">{label}</label>
        <input className="modal-form-input" autoFocus spellCheck={false} inputMode={inputMode}
          placeholder={placeholder} value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
        {hint && <p className="modal-form-hint">{hint}</p>}
        <div className="edit-actions">
          {actionsLeft}
          <div className="meta-spacer" />
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn solid" onClick={submit} disabled={!ok}>{submitLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
