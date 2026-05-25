export type OrganisationStatus =
  | "trial"
  | "active"
  | "past_due"
  | "restricted"
  | "suspended"
  | "cancelled";

export const writableOrganisationStatuses: OrganisationStatus[] = [
  "trial",
  "active",
  "past_due"
];

export function canCreateOperationalRecords(status: OrganisationStatus) {
  return writableOrganisationStatuses.includes(status);
}

export function canAccessBilling(status: OrganisationStatus) {
  return status !== "cancelled";
}
