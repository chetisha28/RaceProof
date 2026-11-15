import { useEffect, useRef } from 'react';
import { SSE_URL } from '../services/api.js';

/**
 * Custom hook to listen to Server-Sent Events (SSE) from RaceProof backend
 * @param {Function} onEvent Callback invoked when any domain event is received
 */
export const useSSE = (onEvent) => {
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const es = new EventSource(SSE_URL, { withCredentials: true });
    eventSourceRef.current = es;

    const eventNames = [
      'team:created',
      'team:updated',
      'team:disbanded',
      'member:joined',
      'member:left',
      'leadership:transferred',
      'request:created',
      'request:accepted',
      'request:declined',
      'request:cancelled',
      'invite:created',
    ];

    eventNames.forEach((eventName) => {
      es.addEventListener(eventName, (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onEvent) {
            onEvent({ type: eventName, data });
          }
        } catch (err) {
          console.error('SSE JSON parse error:', err);
        }
      });
    });

    es.onerror = () => {
      // EventSource auto-reconnects natively on HTTP disconnection
    };

    return () => {
      es.close();
    };
  }, [onEvent]);

  return eventSourceRef.current;
};

