/**
 * LeadModal.jsx — Lead capture modal → opens WhatsApp with pre-filled message
 * WhatsApp: +91 8779328028
 */

import React, { useState } from 'react';
import CONTACT_INFO from '../../config/contact';

const WHATSAPP_NUMBER = CONTACT_INFO.whatsappNumber;

export default function LeadModal({ isOpen, onClose }) {
  const [form, setForm]       = useState({ name: '', email: '', phone: '' });
  const [error, setError]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [waUrl, setWaUrl]     = useState('');

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); setError(''); }

  function handleSubmit() {
    if (!form.name.trim()) { setError('Please enter your name.'); return; }
    if (!form.phone.trim()) { setError('Please enter your phone number.'); return; }
    const msg = `Hi OptionSmart team, I'd like to know more.\n\nName: ${form.name}\nEmail: ${form.email || '-'}\nPhone: ${form.phone}\n\n(via OptionSmart AI Assistant)`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    setWaUrl(url);
    window.open(url, '_blank');
    setSubmitted(true);
  }

  function handleClose() {
    setForm({ name: '', email: '', phone: '' });
    setError('');
    setSubmitted(false);
    onClose?.();
  }

  if (!isOpen) return null;

  return (
    <div className="os-modal-overlay" onClick={handleClose}>
      <div className="os-modal" onClick={e => e.stopPropagation()}>
        <div className="os-modal-head">
          <div className="os-modal-logo">OS</div>
          <div>
            <div className="os-logo-name">Talk to an Advisor</div>
            <div className="os-logo-sub">We'll reach out on WhatsApp</div>
          </div>
        </div>

        {!submitted ? (
          <>
            <p className="os-modal-desc">
              Share a few details and we'll open a WhatsApp chat with our team — pre-filled with your info.
            </p>

            <label className="os-modal-label">Full name</label>
            <input className="os-modal-input" type="text" placeholder="Your name"
              value={form.name} onChange={e => set('name', e.target.value)} />

            <label className="os-modal-label" style={{ marginTop: 10 }}>Email</label>
            <input className="os-modal-input" type="email" placeholder="you@email.com"
              value={form.email} onChange={e => set('email', e.target.value)} />

            <label className="os-modal-label" style={{ marginTop: 10 }}>Phone (WhatsApp)</label>
            <input className="os-modal-input" type="tel" placeholder="+91 9XXXXXXXXX"
              value={form.phone} onChange={e => set('phone', e.target.value)} />

            {error && <div className="os-modal-err">{error}</div>}

            <button className="os-modal-submit" onClick={handleSubmit}>
              Continue on WhatsApp →
            </button>
            <div className="os-modal-hint">
              Opens WhatsApp with your details pre-filled · Nothing stored on our servers
            </div>
          </>
        ) : (
          <div className="os-lead-success">
            <div style={{ fontSize: 38, marginBottom: 10 }}>✅</div>
            <h2 style={{ marginBottom: 6 }}>All set!</h2>
            <p style={{ marginBottom: 18 }}>WhatsApp should have opened. If it didn't, tap below.</p>
            <button className="os-modal-submit" onClick={() => window.open(waUrl, '_blank')}>
              Open WhatsApp again →
            </button>
          </div>
        )}

        <button className="os-modal-close-link" onClick={handleClose}>✕ Close</button>
      </div>
    </div>
  );
}
