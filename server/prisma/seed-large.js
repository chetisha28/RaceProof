import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

const SAMPLE_SKILLS = [
  'React', 'Node.js', 'PostgreSQL', 'Python', 'TypeScript', 'Docker',
  'Kubernetes', 'Go', 'AWS', 'Redis', 'GraphQL', 'Next.js', 'System Design',
  'Rust', 'Java', 'Machine Learning', 'Kafka', 'Terraform', 'Vue.js', 'Solidity'
];

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore'
];

async function main() {
  console.log('🚀 Starting Scalable Dataset Generation (10,000 users, 2,000 teams)...');
  const startTime = Date.now();

  // Create dedicated Large Hackathon
  const hackathon = await prisma.hackathon.create({
    data: {
      name: 'MegaScale Global Hackathon 2026',
      description: 'A 10,000-participant high-throughput benchmark hackathon.',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 7),
    },
  });
  console.log(`🏆 Created benchmark hackathon: ${hackathon.name} (ID: ${hackathon.id})`);

  const passwordHash = await bcrypt.hash('ScalePassword123!', 4); // fast salt for scale

  // 1. Generate 10,000 Users in chunks of 2,000
  console.log('👥 Generating 10,000 users...');
  const userBatches = [];
  const totalUsers = 10000;
  const userBatchSize = 2000;

  for (let i = 0; i < totalUsers; i += userBatchSize) {
    const chunk = [];
    for (let j = 0; j < userBatchSize; j++) {
      const idx = i + j + 1;
      const skillsCount = 2 + (idx % 4);
      const skills = [];
      for (let s = 0; s < skillsCount; s++) {
        skills.push(SAMPLE_SKILLS[(idx + s * 3) % SAMPLE_SKILLS.length]);
      }

      chunk.push({
        id: crypto.randomUUID(),
        name: `Hacker ${idx}`,
        email: `hacker_${idx}_${Date.now()}@raceproof-scale.dev`,
        passwordHash,
        bio: `Full-stack builder passionate about high-concurrency systems. Hacker #${idx}`,
        skills,
        timezone: TIMEZONES[idx % TIMEZONES.length],
      });
    }
    userBatches.push(chunk);
  }

  const allCreatedUserIds = [];
  for (let b = 0; b < userBatches.length; b++) {
    const chunk = userBatches[b];
    await prisma.user.createMany({ data: chunk });
    allCreatedUserIds.push(...chunk.map((u) => u.id));
    console.log(`  - Inserted user batch ${b + 1}/${userBatches.length} (${allCreatedUserIds.length} users total)`);
  }

  // 2. Generate 2,000 Teams in chunks of 500
  // Each team will have a leader (first 2,000 users) and 1-3 additional members (users 2,001 to 8,000)
  console.log('⚡ Generating 2,000 teams and memberships...');
  const totalTeams = 2000;
  const teamBatchSize = 500;
  const teamRecords = [];
  const teamIds = [];

  for (let t = 0; t < totalTeams; t++) {
    const leaderId = allCreatedUserIds[t];
    const teamId = crypto.randomUUID();
    teamIds.push(teamId);

    const reqSkills = [
      SAMPLE_SKILLS[t % SAMPLE_SKILLS.length],
      SAMPLE_SKILLS[(t + 2) % SAMPLE_SKILLS.length],
    ];

    teamRecords.push({
      id: teamId,
      name: `Team ${t + 1} - ${reqSkills.join(' & ')}`,
      description: `Building high-throughput scalable hackathon project #${t + 1}.`,
      hackathonId: hackathon.id,
      leaderId,
      minSize: 2,
      maxSize: 4,
      requiredSkills: reqSkills,
      status: t % 5 === 0 ? 'FULL' : 'ACTIVE',
    });
  }

  // Insert teams in chunks
  for (let i = 0; i < teamRecords.length; i += teamBatchSize) {
    const chunk = teamRecords.slice(i, i + teamBatchSize);
    await prisma.team.createMany({ data: chunk });
    console.log(`  - Inserted team batch ${Math.floor(i / teamBatchSize) + 1}/${Math.ceil(totalTeams / teamBatchSize)}`);
  }

  // 3. Generate Memberships (Leaders + Members)
  console.log('🔗 Generating team memberships...');
  const membershipRecords = [];
  let nextUserIndex = 2000;

  for (let t = 0; t < totalTeams; t++) {
    const team = teamRecords[t];

    // Leader membership
    membershipRecords.push({
      teamId: team.id,
      hackathonId: hackathon.id,
      userId: team.leaderId,
      role: 'LEADER',
    });

    // Add 1 to 3 additional members to make realistic teams
    const additionalMembers = team.status === 'FULL' ? 3 : (t % 3) + 1;
    for (let m = 0; m < additionalMembers; m++) {
      if (nextUserIndex < allCreatedUserIds.length) {
        membershipRecords.push({
          teamId: team.id,
          hackathonId: hackathon.id,
          userId: allCreatedUserIds[nextUserIndex++],
          role: 'MEMBER',
        });
      }
    }
  }

  // Insert memberships in chunks of 2,000
  const memBatchSize = 2000;
  for (let i = 0; i < membershipRecords.length; i += memBatchSize) {
    const chunk = membershipRecords.slice(i, i + memBatchSize);
    await prisma.teamMember.createMany({ data: chunk });
    console.log(`  - Inserted memberships batch ${Math.floor(i / memBatchSize) + 1}/${Math.ceil(membershipRecords.length / memBatchSize)}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Scalable dataset generation finished in ${duration}s!`);
  console.log(`📊 Total Users:       ${totalUsers}`);
  console.log(`📊 Total Teams:       ${totalTeams}`);
  console.log(`📊 Total Memberships: ${membershipRecords.length}`);
  console.log(`📊 Unassigned Users:  ${allCreatedUserIds.length - nextUserIndex} (available for suggestions & join tests)`);
}

main()
  .catch((e) => {
    console.error('❌ Scalable seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
