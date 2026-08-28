'use client';

import { useState } from 'react';
import Logo from '@/app/Logo';

/**
 * The title card: the wordmark, full-page on the app's own grid, its bars
 * playing on a loop, and the line arriving one word at a time.
 *
 * It reuses <Logo> rather than a copy of the SVG, so the thing being filmed is
 * the real wordmark — but it does *not* take the `brand-logo-full` class the
 * header uses. That class carries the hover animation, which would fight the
 * loop the moment the mouse crossed the logo mid-take. The card brings its own
 * (see .hero-logo in globals.css).
 *
 * Clicking replays the word reveal: remounting on a take counter restarts every
 * animation, which beats reloading between shots.
 */
const WORDS = 'Plan and track your project updates'.split(' ');

/* When the words start, in seconds — late enough that the bars have played
   their first wave and settled. */
const FIRST_WORD = 2.5;
const BETWEEN_WORDS = 0.13;

export default function LogoCard() {
  const [take, setTake] = useState(0);

  return (
    <div className="hero" onClick={() => setTake((t) => t + 1)} title="Click to replay">
      <div className="hero-inner" key={take}>
        <Logo className="hero-logo" height={140} />
        <p className="hero-line">
          {WORDS.map((word, i) => (
            <span
              key={word + i}
              className="hero-word"
              style={{ animationDelay: FIRST_WORD + i * BETWEEN_WORDS + 's' }}
            >
              {word}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
