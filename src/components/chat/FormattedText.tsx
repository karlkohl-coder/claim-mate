import { Fragment, type ReactNode } from "react";

/*
 * Sehr einfache Darstellung von KI-Text: **fett**, *kursiv*, Aufzählungen mit "- " oder "* ".
 * Baut React-Elemente (kein HTML aus dem Text), damit nichts eingeschleust werden kann.
 */

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|(?<![*\w])[*_](?!\s)(.+?)(?<!\s)[*_](?![*\w])/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(match[1] !== undefined ? <strong key={match.index}>{match[1]}</strong> : <em key={match.index}>{match[2]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function FormattedText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul${blocks.length}`} className="my-1 list-disc pl-5">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const line of text.split("\n")) {
    const item = line.match(/^\s*[-*•]\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      if (blocks.length > 0) blocks.push(<span key={`br${blocks.length}`} className="block h-2" />);
    } else {
      blocks.push(
        <Fragment key={`p${blocks.length}`}>
          <span className="block">{inline(line)}</span>
        </Fragment>,
      );
    }
  }
  flushList();
  return <>{blocks}</>;
}
