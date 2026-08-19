/**
 * Dev helper: grant a platform user a membership in the synthetic bank organization.
 *
 * Usage: tsx packages/db/scripts/grant-membership.ts <email> [ROLE]
 * ROLE defaults to OWNER. Idempotent (upsert). Writes one organization_members row — no
 * schema change. The user must already exist (they are provisioned on first sign-in).
 */
import { loadDotEnvFile } from '../../config/src/dotenv';

loadDotEnvFile();

import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const ROLES = ['OWNER', 'ADMIN', 'ANALYST', 'AUDITOR', 'OPERATOR'] as const;
type Role = (typeof ROLES)[number];

const main = async (): Promise<void> => {
  const email = process.argv[2];
  const roleArg = (process.argv[3] ?? 'OWNER').toUpperCase();
  if (email === undefined) {
    throw new Error('Usage: grant-membership.ts <email> [ROLE]');
  }
  if (!ROLES.includes(roleArg as Role)) {
    throw new Error(`ROLE must be one of ${ROLES.join(', ')}.`);
  }
  const role = roleArg as Role;

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { primaryEmail: email } });
    if (user === null) {
      throw new Error(`No user with email ${email}. Sign in once so the account is provisioned.`);
    }

    const banks = await prisma.organization.findMany({ where: { type: 'BANK' } });
    if (banks.length === 0) {
      throw new Error('No BANK organization found. Run pnpm db:seed.');
    }
    const org = banks[0]!;

    const membership = await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { role, status: 'ACTIVE', activatedAt: new Date() },
      create: {
        id: ulid(),
        organizationId: org.id,
        userId: user.id,
        role,
        status: 'ACTIVE',
        activatedAt: new Date(),
        correlationId: 'grant-membership-script',
      },
    });

    process.stdout.write(
      `Granted ${role} to ${email} in ${org.slug} (${org.id}); membership ${membership.id}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
