/** Normalize whitespace and strip common junk; safe for downstream chunking. */
export function cleanExtractedText(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/\u0000/g, "");
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/[\u200b-\u200d\ufeff]/g, "");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

// input: "Hello\n\nWorld"
// output: "Hello\nWorld"
//
// input: "   Hello   World   "
// output: "Hello World"
//
// input: "foo\u00a0bar"            (non-breaking space)
// output: "foo bar"
//
// input: "abc\r\ndef\rghi"
// output: "abc\ndef\nghi"
//
// input: "abc\u200b\u200c\u200ddef"  (zero-width chars)
// output: "abcdef"
//
// input: "\n\n\nParagraph 1\n\n\n\nParagraph 2\n\n\n"
// output: "Paragraph 1\n\nParagraph 2"
//
// input: ""
// output: ""

// TODO: more to be added later