// qa/jslex.mjs: a small JavaScript tokenizer for the text and lint gates. It finds string literals, template literal
// text, comments and regular expression literals, which is all qa/nodash.mjs and qa/lint.mjs need to know.
// Owner: WP-0B (DESIGN 1.8 "qa/nodash.mjs tokenizes JS string and template literals", 2.2 WP-0B lint rules).
//
// It is the I0 baseline scanner's lexer (the one that recorded qa/golden/nodash-baseline.txt), kept to the same rules so
// the report reproduces that baseline exactly:
//   - "..." and '...' strings end at their quote or at the end of the line; a backslash skips the next character;
//   - a template literal's text parts are separate segments, split at each ${...}, whose contents are code again
//     (nested templates included);
//   - a "/" starts a regular expression where an expression may begin (after an operator, a bracket, a keyword such
//     as return, or at the start of the file), otherwise it is a division.
//
//   import {lexJS, codeOnly, lineIndex} from "./jslex.mjs";
//   const {strings, comments, regexes} = lexJS(src);   // [start, end) offsets: strings and regexes exclude their
//                                                       // delimiters, comments include them
//   const code = codeOnly(src);                         // same length and line breaks, comments, string text and regex
//                                                       // bodies blanked to spaces: what is left is code

const KEYWORD_BEFORE_EXPR = /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

export function lexJS(src){
  const strings = [], comments = [], regexes = [];
  const n = src.length, stack = [];
  let i = 0, depth = 0, lastSig = "", lastWord = "";
  const regexOk = () => {
    if (lastSig === "") return true;
    if ("(,=:[!&|?{};+-*%<>~^".includes(lastSig)) return true;
    return KEYWORD_BEFORE_EXPR.test(lastWord);
  };
  // template text from i (just after ` or after the } closing a ${...}) up to the closing ` or the next ${
  const tmpl = () => {
    const s = i;
    while (i < n){
      const ch = src[i];
      if (ch === "\\"){ i += 2; continue; }
      if (ch === "`"){ strings.push([s, i]); i++; return; }
      if (ch === "$" && src[i + 1] === "{"){ strings.push([s, i]); i += 2; stack.push(depth); depth = 0; return; }
      i++;
    }
    strings.push([s, n]);
  };
  while (i < n){
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/"){ const s = i; while (i < n && src[i] !== "\n") i++; comments.push([s, i]); continue; }
    if (ch === "/" && src[i + 1] === "*"){ const s = i, e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; comments.push([s, i]); continue; }
    if (ch === '"' || ch === "'"){
      const q = ch, s = ++i;
      while (i < n && src[i] !== q && src[i] !== "\n"){ if (src[i] === "\\") i++; i++; }
      strings.push([s, i]); i++; lastSig = '"'; lastWord = ""; continue;
    }
    if (ch === "`"){ i++; tmpl(); lastSig = '"'; lastWord = ""; continue; }
    if (ch === "/" && regexOk()){
      const s = ++i; let cls = false;
      while (i < n && src[i] !== "\n"){
        if (src[i] === "\\"){ i += 2; continue; }
        if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; else if (src[i] === "/" && !cls) break;
        i++;
      }
      regexes.push([s, Math.min(i, n)]);
      i++; while (i < n && /[a-z]/.test(src[i])) i++;
      lastSig = '"'; lastWord = ""; continue;
    }
    if (ch === "{") depth++;
    if (ch === "}"){
      if (stack.length && depth === 0){ depth = stack.pop(); i++; tmpl(); lastSig = '"'; lastWord = ""; continue; }
      depth--;
    }
    if (/\s/.test(ch)){ i++; continue; }
    if (/[A-Za-z0-9_$]/.test(ch)){
      const s = i; while (i < n && /[A-Za-z0-9_$.]/.test(src[i])) i++;
      lastWord = src.slice(s, i); lastSig = KEYWORD_BEFORE_EXPR.test(lastWord) ? "z" : "a"; continue;
    }
    lastSig = ch; lastWord = ""; i++;
  }
  return {strings, comments, regexes};
}

// the source with every comment, string text and regex body replaced by spaces (line breaks kept), so offsets and
// line numbers still match the file. Quotes, backticks and ${ } stay, so the shape of the code is unchanged.
export function codeOnly(src, lex = lexJS(src)){
  const out = src.split("");
  const blank = ([a, b]) => { for (let k = a; k < b && k < out.length; k++) if (out[k] !== "\n") out[k] = " "; };
  lex.comments.forEach(blank); lex.strings.forEach(blank); lex.regexes.forEach(blank);
  return out.join("");
}

// offset to 1-based line number, by binary search over the line starts
export function lineIndex(src){
  const starts = [0];
  for (let k = 0; k < src.length; k++) if (src.charCodeAt(k) === 10) starts.push(k + 1);
  const lineOf = idx => { let lo = 0, hi = starts.length - 1; while (lo < hi){ const m = (lo + hi + 1) >> 1; if (starts[m] <= idx) lo = m; else hi = m - 1; } return lo + 1; };
  const lineText = ln => src.slice(starts[ln - 1], ln < starts.length ? starts[ln] - 1 : src.length);
  return {lineOf, lineText, count: starts.length};
}
