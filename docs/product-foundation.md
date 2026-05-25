# WorkLine Co Product Foundation

WorkLine Co is a configurable ERP and workflow operating system for CA firms,
litigation practices, compliance teams, and professional service organisations.

## Core Principles

- One user belongs to one organisation.
- Organisations define their own hierarchy, role names, departments, statuses,
  and workflow labels.
- Internal permission keys stay controlled by the platform so security remains
  predictable.
- Every operational row stores `organisation_id`.
- Payment state lives on the organisation and can restrict or suspend access.
- Audit logs are mandatory for sensitive changes.

## First Build

The first build should only establish the spine:

1. Authentication
2. Organisation setup
3. User profile linked to one organisation
4. Custom roles and permission matrix
5. Flexible reporting hierarchy
6. Dashboard shell
7. Client Master
8. Team Master
9. Task allocation
10. Subscription status gates
11. Audit logs

## Configurable Surface

Organisations should be able to configure:

- role names
- hierarchy levels
- reporting lines
- departments
- task statuses
- task priorities
- client categories
- billing stages
- checklist templates
- custom fields
- notification preferences

## Internal System Rules

The following concepts should remain system-controlled:

- `organisation_id`
- `user_id`
- permission keys
- subscription status
- audit logging
- security policies
- timestamps
- ownership of core records

This gives the customer autonomy without weakening the product's security model.
