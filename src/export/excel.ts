import { Workbook } from 'exceljs';
import type { BoardData } from '../boardStore';
import type { ParsedTask } from '../parser';

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type ExportRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  lane: string;
  notePath: string;
  description: string;
  x: number | '';
  y: number | '';
  width: number | '';
  height: number | '';
};

const headerFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
} as const;

const borderStyle = {
  style: 'thin',
  color: { argb: 'FFCBD5E1' },
} as const;

const cellBorder = {
  top: borderStyle,
  left: borderStyle,
  bottom: borderStyle,
  right: borderStyle,
} as const;

export async function buildStyledWorkbookBuffer(
  board: BoardData,
  tasks: Map<string, ParsedTask>,
  boardTitle: string
): Promise<Uint8Array> {
  const workbook = new Workbook();
  workbook.creator = 'MindTask';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Tasks', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'ID', key: 'id', width: 20 },
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Lane', key: 'lane', width: 20 },
    { header: 'Note', key: 'notePath', width: 28 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'X', key: 'x', width: 8 },
    { header: 'Y', key: 'y', width: 8 },
    { header: 'Width', key: 'width', width: 10 },
    { header: 'Height', key: 'height', width: 10 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = {
      name: 'Inter',
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = cellBorder;
  });

  const rows: ExportRow[] = Object.entries(board.nodes).map(([id, node]) => {
    const task = tasks.get(id);
    const title =
      node.title ||
      task?.text ||
      (node as any).name ||
      (node as any).text ||
      id;
    const status = task?.checked
      ? 'Done'
      : node.status
        ? node.status === 'progress'
          ? 'In progress'
          : 'Standby'
        : task
          ? 'Open'
          : '';
    const description =
      task?.description ||
      (node as any).description ||
      (node as any).content ||
      '';
    const notePath = task?.notePath || (node as any).notePath || '';
    const laneLabel = node.lane ? board.lanes[node.lane]?.label ?? '' : '';
    return {
      id,
      title: title?.toString().trim() ?? '',
      type: node.type ?? 'task',
      status,
      lane: laneLabel,
      notePath,
      description,
      x: node.x ?? '',
      y: node.y ?? '',
      width: node.width ?? '',
      height: node.height ?? '',
    };
  });

  rows.forEach((row, index) => {
    const excelRow = sheet.addRow(row);
    excelRow.height = 20;
    excelRow.eachCell((cell, colNumber) => {
      const isNumericColumn = colNumber >= 8;
      cell.font = {
        name: 'Inter',
        size: 11,
        color: { argb: 'FF111827' },
      };
      cell.alignment = {
        vertical: 'top',
        horizontal: isNumericColumn ? 'center' : 'left',
        wrapText: true,
      };
      cell.border = cellBorder;
      if (index % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });

    const statusCell = excelRow.getCell('status');
    if (row.status === 'Done') {
      statusCell.font = {
        name: 'Inter',
        size: 11,
        color: { argb: 'FF166534' },
        italic: true,
      };
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCFCE7' },
      };
      const titleCell = excelRow.getCell('title');
      titleCell.font = {
        name: 'Inter',
        size: 11,
        color: { argb: 'FF6B7280' },
        strike: true,
      };
    } else if (row.status === 'In progress') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF9C3' },
      };
    }
  });

  const infoSheet = workbook.addWorksheet('Board Info');
  infoSheet.columns = [
    { header: 'Field', key: 'field', width: 24 },
    { header: 'Value', key: 'value', width: 50 },
  ];

  infoSheet.addRow({ field: 'Board', value: boardTitle });
  infoSheet.addRow({ field: 'Orientation', value: board.orientation ?? 'vertical' });
  infoSheet.addRow({ field: 'Exported', value: new Date().toLocaleString() });
  infoSheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = cellBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      if (rowNumber === 1) {
        cell.font = { name: 'Inter', bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' },
        };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer);
}
