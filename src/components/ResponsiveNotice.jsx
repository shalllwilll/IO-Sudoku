export default function ResponsiveNotice() {
  return (
    <p
      role="note"
      className="hidden border-b border-steel bg-carbon px-4 py-2 text-center text-xs text-soft-white/80 max-[767px]:block"
    >
      IO Signal Sudoku is designed for larger screens. Some views may be harder to use on this device.
    </p>
  );
}
