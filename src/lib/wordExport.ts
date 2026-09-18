import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
} from "docx";
import { saveAs } from "file-saver";
import type { Question } from "./types";

interface Paper {
  title: string;
}

function questionParagraphs(q: Question, idx: number, mode: "blank" | "answer" | "explain"): Paragraph[] {
  const paras: Paragraph[] = [];
  paras.push(
    new Paragraph({
      children: [new TextRun({ text: `${idx + 1}. ${q.question_text}`, bold: true })],
      spacing: { before: 200 },
    })
  );
  if (q.options) {
    for (const opt of q.options) {
      paras.push(new Paragraph({
        children: [new TextRun(`${opt.label}. ${opt.text}`)],
        indent: { left: 360 },
      }));
    }
  }
  if (mode === "answer") {
    paras.push(new Paragraph({
      children: [new TextRun({ text: `【答案】${q.correct_answer}`, bold: true, color: "0F766E" })],
      indent: { left: 360 },
    }));
  }
  if (mode === "explain" || mode === "answer") {
    paras.push(new Paragraph({
      children: [new TextRun({ text: `【解析】${q.explanation}`, color: "374151" })],
      indent: { left: 360 },
    }));
  }
  return paras;
}

export async function exportWord(paper: Paper, questions: Question[], mode: "blank" | "answer" | "explain") {
  const titleText = mode === "blank" ? `${paper.title}（空卷）` : mode === "answer" ? `${paper.title}（答案卷）` : `${paper.title}（解析卷）`;
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: titleText, bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
      alignment: "center",
    }),
  ];
  questions.forEach((q, i) => children.push(...questionParagraphs(q, i, mode)));

  const doc = new Document({ sections: [{ children: children as Paragraph[] }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${titleText}.docx`);
}
