export type WorkLineModuleKey =
  | "dashboard"
  | "client_master"
  | "gst_tracker"
  | "pdf_indexing"
  | "attendance"
  | "team_master"
  | "task_allocation"
  | "billing"
  | "meeting_room"
  | "file_management"
  | "litigation"
  | "drafting_library"
  | "whatsapp_intake"
  | "email_intake"
  | "notice_tracking"
  | "analytics"
  | "roles";

export type ModuleStage = "foundation" | "mvp" | "planned" | "future";

export type WorkLineModule = {
  key: WorkLineModuleKey;
  label: string;
  stage: ModuleStage;
  permissionPrefix: string;
};

export const workLineModules: WorkLineModule[] = [
  { key: "dashboard", label: "Dashboard", stage: "foundation", permissionPrefix: "dashboard" },
  { key: "client_master", label: "Client Master", stage: "mvp", permissionPrefix: "client" },
  { key: "gst_tracker", label: "GST Tracker", stage: "planned", permissionPrefix: "gst" },
  { key: "pdf_indexing", label: "PDF & Indexing", stage: "planned", permissionPrefix: "pdf" },
  { key: "attendance", label: "Attendance", stage: "planned", permissionPrefix: "attendance" },
  { key: "team_master", label: "Team Master", stage: "mvp", permissionPrefix: "team" },
  { key: "task_allocation", label: "Task & Work Allocation", stage: "mvp", permissionPrefix: "task" },
  { key: "billing", label: "Billing & Fee Realisation", stage: "planned", permissionPrefix: "billing" },
  { key: "meeting_room", label: "Meeting Room Allocation", stage: "planned", permissionPrefix: "meeting" },
  { key: "file_management", label: "File Management", stage: "planned", permissionPrefix: "file" },
  { key: "litigation", label: "Litigation Management", stage: "future", permissionPrefix: "litigation" },
  { key: "drafting_library", label: "Drafting & Ground Library", stage: "future", permissionPrefix: "drafting" },
  { key: "whatsapp_intake", label: "WhatsApp Intake", stage: "future", permissionPrefix: "intake.whatsapp" },
  { key: "email_intake", label: "Email Intake", stage: "future", permissionPrefix: "intake.email" },
  { key: "notice_tracking", label: "Notice Tracking", stage: "future", permissionPrefix: "notice" },
  { key: "analytics", label: "Analytics & Productivity", stage: "future", permissionPrefix: "analytics" },
  { key: "roles", label: "User & Role Management", stage: "foundation", permissionPrefix: "role" }
];
