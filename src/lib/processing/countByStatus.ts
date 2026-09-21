export interface ProcessingCounts {
  pending: number;
  processing: number;
  completed: number;
  reviewRequired: number;
  failed: number;
  total: number;
}

/** Telt company_processing-rijen per status op, voor de voortgangsweergave. */
export function countByStatus(rows: { status: string }[]): ProcessingCounts {
  const counts: ProcessingCounts = {
    pending: 0,
    processing: 0,
    completed: 0,
    reviewRequired: 0,
    failed: 0,
    total: rows.length,
  };
  for (const row of rows) {
    if (row.status === "pending") counts.pending += 1;
    else if (row.status === "processing") counts.processing += 1;
    else if (row.status === "completed") counts.completed += 1;
    else if (row.status === "review_required") counts.reviewRequired += 1;
    else if (row.status === "failed") counts.failed += 1;
  }
  return counts;
}
