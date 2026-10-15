export interface Edit {
  value: string;
  start: number;
  end: number;
}

/** Wrap (or unwrap) the selection in a WhatsApp formatting marker. With no selection, drops a pair and parks the caret between. */
export function toggleWrap(value: string, start: number, end: number, marker: string): Edit {
  const m = marker.length;
  if (start === end) {
    return { value: value.slice(0, start) + marker + marker + value.slice(end), start: start + m, end: start + m };
  }
  // markers hug the text: pull the selection in past any spaces or line breaks
  let s = start;
  let e = end;
  while (s < e && /\s/.test(value[s])) s++;
  while (e > s && /\s/.test(value[e - 1])) e--;
  if (s === e) return { value, start, end };

  const inner = value.slice(s, e);
  // already wrapped inside the selection → unwrap
  if (inner.length >= m * 2 && inner.startsWith(marker) && inner.endsWith(marker)) {
    const bare = inner.slice(m, inner.length - m);
    return { value: value.slice(0, s) + bare + value.slice(e), start: s, end: s + bare.length };
  }
  // wrapped just outside the selection → unwrap
  if (value.slice(s - m, s) === marker && value.slice(e, e + m) === marker) {
    return { value: value.slice(0, s - m) + inner + value.slice(e + m), start: s - m, end: s - m + inner.length };
  }
  return { value: value.slice(0, s) + marker + inner + marker + value.slice(e), start: s + m, end: e + m };
}

/** Insert text at the caret, replacing any selection. */
export function insertText(value: string, start: number, end: number, text: string): Edit {
  const at = start + text.length;
  return { value: value.slice(0, start) + text + value.slice(end), start: at, end: at };
}
