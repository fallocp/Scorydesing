/** A real, deliberately small PDF: two page objects, independent streams, byte offsets and xref. */
export function materialsPdfFixture(revision = 'A'): Uint8Array<ArrayBuffer> {
  const escape = (value: string) => value.replace(/[\\()]/g, char => `\\${char}`);
  const stream = (lines: string[]) => `BT /F1 18 Tf 48 650 Td ${lines.map((line, index) => `${index ? '0 -32 Td ' : ''}(${escape(line)}) Tj`).join('\n')} ET\n0.08 0.37 0.38 rg 48 390 230 100 re f`;
  const first = stream(['Marca Verde', 'Color principal #145E62', `Manual version ${revision}`]);
  const second = stream(['Reglas de comunicacion', 'No prometer resultados garantizados.', 'Tono claro, cercano y verificable.']);
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${encoder.encode(first).length} >>\nstream\n${first}\nendstream`,
    `<< /Length ${encoder.encode(second).length} >>\nstream\n${second}\nendstream`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) { offsets.push(encoder.encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(pdf);
}

export const MATERIALS_TEST_COLLECTION = '00000000-0000-4000-8000-000000000012';
