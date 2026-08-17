export type Attendance = "HERE" | "ABSENT";

/** 'admin' may delete; 'member' may log sheets and correct entries. */
export type Role = "admin" | "member";

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
}

export interface Grade {
  id: number;
  name: string;
  sort_order: number;
}

export interface ClassRow {
  id: number;
  grade_id: number;
  label: string;
  teacher_name: string | null;
  sort_order: number;
}

export interface Kid {
  id: number;
  class_id: number;
  english_name: string;
  korean_name: string | null;
  sort_order: number;
  archived: number;
}

export interface Week {
  id: number;
  grade_id: number;
  label: string;
  attendance_date: string | null;
  sort_order: number;
}

export interface Entry {
  id: number;
  kid_id: number;
  week_id: number;
  attendance: Attendance;
  qt_pages: number;
  updated_at: string;
  updated_by: string | null;
}

// ------------------------------------------------------------- extraction
//
// A teacher's paper sheet covers the full term rather than one week. Children
// occupy rows; each Sunday has a dated pair of columns for attendance (A) and
// QT pages (Q). One photograph can therefore contain several weeks.

/** One dated column pair on the sheet. */
export interface ExtractedColumn {
  /** Header exactly as printed, e.g. "8/31". */
  header: string;
  /** ISO date if the header could be resolved against a ministry year. */
  date: string | null;
}

export interface ExtractedCell {
  attendance: Attendance;
  qt_pages: number;
  /** Marks a low-confidence extraction for highlighting during review. */
  uncertain?: boolean;
}

export interface ExtractedRow {
  english_name: string;
  korean_name: string | null;
  /** Same length and order as `columns`. */
  cells: ExtractedCell[];
  /**
   * The source row sits outside the printed grid, such as a name in the margin.
   * Show it during review before adding that child to the roster.
   */
  outside_grid?: boolean;
  uncertain_name?: boolean;
}

export interface ExtractedSheet {
  class_label: string | null;
  teacher_name: string | null;
  columns: ExtractedColumn[];
  rows: ExtractedRow[];
  /** Extraction observations that are useful during review but do not block saving. */
  notes: string[];
}

/** Older flat representation retained for manual entry of a single week. */
export interface FlatRow {
  english_name: string;
  korean_name: string | null;
  attendance: Attendance;
  qt_pages: number;
}

export interface RecordsKidRow {
  kid_id: number;
  english_name: string;
  korean_name: string | null;
  class_id: number;
  class_label: string;
  /** Keyed by week id. Weeks with no entry are simply absent from the map. */
  cells: Record<number, { attendance: Attendance; qt_pages: number }>;
  total_qt: number;
}
