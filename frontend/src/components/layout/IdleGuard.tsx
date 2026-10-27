import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pingActivity } from '../../api/work';
import { useSession } from '../../session/session-context';
import { Button, Modal } from '../ui';

/** The server signs a receptionist out after this long without activity. Keep in step with it. */
export const IDLE_LIMIT_MS = 15 * 60 * 1000;
export const IDLE_WARNING_MS = 14 * 60 * 1000;
const PING_EVERY_MS = 60 * 1000;
const CHECK_EVERY_MS = 5 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

/**
 * Receptionist hours are counted from sign-in to sign-out, so an unattended desk must sign out.
 * Real clicks and keys are reported to the server (at most once a minute) to keep the session
 * alive; one minute before the limit a warning offers to stay signed in.
 */
export function IdleGuard() {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const lastActive = useRef(Date.now());
  const lastPing = useRef(0);
  const warning = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const report = () => {
      const now = Date.now();
      if (now - lastPing.current >= PING_EVERY_MS) {
        lastPing.current = now;
        pingActivity().catch(() => {
          // A refused ping means the server already ended the session; the app signs out.
        });
      }
    };
    const seen = () => {
      if (warning.current) return; // once warned, only the button counts
      lastActive.current = Date.now();
      report();
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, seen, { passive: true }));
    report();

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActive.current;
      if (idle >= IDLE_LIMIT_MS) {
        window.clearInterval(timer);
        void signOut().finally(() => navigate('/login?role=receptionist&reason=idle'));
      } else if (idle >= IDLE_WARNING_MS) {
        warning.current = true;
        setSecondsLeft(Math.max(1, Math.ceil((IDLE_LIMIT_MS - idle) / 1000)));
      }
    }, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, seen));
      window.clearInterval(timer);
    };
  }, [signOut, navigate]);

  const stay = () => {
    warning.current = false;
    lastActive.current = Date.now();
    lastPing.current = Date.now();
    setSecondsLeft(null);
    pingActivity().catch(() => undefined);
  };

  return (
    <Modal
      open={secondsLeft !== null}
      onClose={stay}
      title="Are you still there?"
      description={`You will be signed out in about ${secondsLeft ?? 0} seconds because there has been no activity.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => void signOut().finally(() => navigate('/'))}>
            Sign out now
          </Button>
          <Button onClick={stay}>Stay signed in</Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">
        Your working hours stop counting when you are signed out.
      </p>
    </Modal>
  );
}
