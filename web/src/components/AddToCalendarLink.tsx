export function AddToCalendarLink({ sessionId }: { sessionId: string }) {
  const href = `/api/calendar/session/${sessionId}`;
  return (
    <a
      href={href}
      className="inline-flex items-center text-sm text-[#58a6ff] hover:underline"
      download
    >
      Add to calendar (.ics)
    </a>
  );
}
