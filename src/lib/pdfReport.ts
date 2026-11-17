import { jsPDF } from 'jspdf';
import type { ClinicalTrial, PatientProfile, ScreeningMatch } from '../types/clinical';

function addWrappedBlock(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5.5,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function downloadClinicianReportPdf(
  match: ScreeningMatch,
  patient?: PatientProfile,
  trial?: ClinicalTrial,
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 41, 66);
  doc.text('Clinical Trial Match AI — Clinician & Coordinator Pre-Screening Report', 14, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Generated: ${new Date().toLocaleString()} | Outcome: ${match.overallOutcome.replace(/_/g, ' ')} | Review: ${match.reviewStatus.replace(/_/g, ' ')}`,
    14,
    y,
  );
  y += 6;

  // Safety Disclaimer Box
  doc.setDrawColor(180, 83, 9);
  doc.setFillColor(255, 251, 235);
  doc.rect(14, y, 182, 16, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(146, 64, 14);
  doc.text('CLINICAL DECISION-SUPPORT BOUNDARY NOTICE', 17, y + 5);
  doc.setFont('helvetica', 'normal');
  addWrappedBlock(
    doc,
    'This pre-screening summary is for clinical research workflow support only. It does NOT determine final trial eligibility, enroll patients, or recommend medical treatments. Final eligibility must be confirmed by an authorized Principal Investigator / clinical team.',
    17,
    y + 10,
    176,
    4,
  );
  y += 22;

  // Patient & Trial Summary
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. Patient & Trial Context', 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  y = addWrappedBlock(
    doc,
    `Patient Record: ${match.patientName} (${match.patientMrnLabel})${patient ? ` | Age: ${patient.age ?? 'Unknown'} | Sex: ${patient.sex} | Diagnosis: ${patient.primaryDiagnosis} (${patient.diseaseStage})` : ''}`,
    14,
    y,
    182,
  );
  y = addWrappedBlock(
    doc,
    `Trial: ${match.nctId} — ${trial?.title || match.trialTitle} | Phase: ${match.trialPhase} | Status: ${match.recruitmentStatus} | Data Origin: ${match.trialDataOrigin.replace(/_/g, ' ')}`,
    14,
    y + 1,
    182,
  );
  y += 4;

  // Criterion-by-Criterion Findings
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    `2. Criterion-by-Criterion Findings (${match.summaryCounts.met} Met, ${match.summaryCounts.notMet} Not Met, ${match.summaryCounts.unknown} Unknown, ${match.summaryCounts.conflicting} Conflicting)`,
    14,
    y,
  );
  y += 6;

  doc.setFontSize(9);
  for (const ev of match.evaluations) {
    const effective = ev.reviewerOverrideStatus ?? ev.status;
    if (y > 255) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 41, 66);
    y = addWrappedBlock(
      doc,
      `[${effective}] (${ev.criterionType} · ${ev.sourceSection}) ${ev.originalCriterionText}`,
      14,
      y,
      182,
      4.5,
    );
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    y = addWrappedBlock(
      doc,
      `Evidence: ${ev.patientEvidence} (Source: ${ev.evidenceSourceRef}) | Confidence: ${ev.confidence}`,
      18,
      y,
      178,
      4.3,
    );
    y = addWrappedBlock(doc, `Rationale: ${ev.explanation}`, 18, y, 178, 4.3);
    if (ev.uncertaintyNote || ev.reviewerNote) {
      y = addWrappedBlock(
        doc,
        `Notes/Uncertainty: ${[ev.uncertaintyNote, ev.reviewerNote].filter(Boolean).join(' | ')}`,
        18,
        y,
        178,
        4.3,
      );
    }
    y += 2.5;
  }

  // Missing Information
  if (match.missingDocumentation.length > 0) {
    if (y > 245) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Missing Documentation Checklist', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const item of match.missingDocumentation) {
      y = addWrappedBlock(
        doc,
        `- ${item.documentationNeeded} (Required by: ${item.reasonFromCriterion}). Gap: ${item.currentRecordGap}`,
        14,
        y,
        182,
        4.5,
      );
    }
    y = addWrappedBlock(
      doc,
      'Note: The clinical team must decide whether obtaining further records or diagnostic testing is clinically appropriate.',
      14,
      y + 2,
      182,
      4.5,
    );
    y += 4;
  }

  // Reviewer Comments
  if (match.reviewerComments.length > 0) {
    if (y > 250) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('4. Reviewer Notes & Sign-Off', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const c of match.reviewerComments) {
      y = addWrappedBlock(
        doc,
        `${c.authorName} (${c.authorRole}) [${new Date(c.createdAt).toLocaleDateString()}]: ${c.comment}`,
        14,
        y,
        182,
        4.5,
      );
    }
  }

  doc.save(`${match.patientMrnLabel}_${match.nctId}_Clinician_PreScreen_Report.pdf`);
}

export function downloadPatientSummaryPdf(
  match: ScreeningMatch,
  trial?: ClinicalTrial,
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 41, 66);
  doc.text('Clinical Trial Information Summary (For Patient Discussion)', 14, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Prepared for: ${match.patientName} | Reference Study: ${match.nctId} | Date: ${new Date().toLocaleDateString()}`,
    14,
    y,
  );
  y += 8;

  // Important Plain-Language Disclaimer
  doc.setDrawColor(13, 148, 136);
  doc.setFillColor(240, 253, 250);
  doc.rect(14, y, 182, 18, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(17, 94, 89);
  doc.text('IMPORTANT NOTICE FOR PATIENTS', 17, y + 5.5);
  doc.setFont('helvetica', 'normal');
  addWrappedBlock(
    doc,
    'This summary is an educational overview to discuss with your doctor. It is NOT a confirmation that you qualify for this clinical trial, NOT medical advice, and NOT a treatment recommendation. Only the clinical trial doctor and your healthcare team can determine whether a study is right for you.',
    17,
    y + 10.5,
    176,
    4.2,
  );
  y += 25;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('What This Study Is Researching', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  y = addWrappedBlock(doc, `Study Title: ${trial?.title || match.trialTitle}`, 14, y, 182);
  y = addWrappedBlock(
    doc,
    `Condition Studied: ${match.trialCondition} | Study Phase: ${match.trialPhase} | Current Status: ${match.recruitmentStatus}`,
    14,
    y + 1,
    182,
  );
  y = addWrappedBlock(
    doc,
    trial?.summary || 'Detailed study overview available on ClinicalTrials.gov.',
    14,
    y + 2,
    182,
  );
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Where the Study Is Located & How to Contact the Team', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (trial && trial.locations.length > 0) {
    for (const loc of trial.locations.slice(0, 4)) {
      y = addWrappedBlock(
        doc,
        `- ${loc.facility} (${loc.city}${loc.state ? `, ${loc.state}` : ''}, ${loc.country}) — ${loc.siteVerified ? 'Locally Verified Site' : 'Registry-Listed Site'}${loc.contactName ? ` | Contact: ${loc.contactName}` : ''}${loc.contactPhone ? ` (${loc.contactPhone})` : ''}${loc.contactEmail ? ` | ${loc.contactEmail}` : ''}`,
        14,
        y,
        182,
      );
    }
  } else {
    y = addWrappedBlock(doc, `Primary Location: ${match.trialLocationSummary}`, 14, y, 182);
  }
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Key Eligibility Topics to Discuss With Your Care Team', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  y = addWrappedBlock(
    doc,
    `Based on an initial research pre-screen (${match.summaryCounts.met} key points appear aligned, ${match.summaryCounts.unknown} items need missing records, and ${match.summaryCounts.notMet + match.summaryCounts.conflicting} items need physician clarification):`,
    14,
    y,
    182,
  );
  y += 2;

  for (const ev of match.evaluations.slice(0, 8)) {
    const eff = ev.reviewerOverrideStatus ?? ev.status;
    const plainStatus =
      eff === 'MET'
        ? 'Appears aligned'
        : eff === 'NOT_MET'
          ? 'May not meet study rule'
          : eff === 'CONFLICTING'
            ? 'Needs doctor clarification'
            : 'More information needed';
    y = addWrappedBlock(
      doc,
      `• ${ev.originalCriterionText} — [${plainStatus}]`,
      14,
      y,
      182,
    );
  }

  if (match.missingDocumentation.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Records Your Doctor May Want to Review Together', 14, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    for (const m of match.missingDocumentation) {
      y = addWrappedBlock(doc, `• ${m.documentationNeeded}`, 14, y, 182);
    }
  }

  doc.save(`${match.patientMrnLabel}_${match.nctId}_Patient_Information_Summary.pdf`);
}
