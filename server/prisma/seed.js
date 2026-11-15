import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting RaceProof database seeding...');

  // 1. Clean existing records in correct foreign key order
  await prisma.auditLog.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.joinRequest.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.hackathon.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Cleaned existing tables.');

  // 2. Hash default password for demo accounts
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // 3. Create Sample Users with timezone and skills
  const usersData = [
    {
      name: 'Alice Vance',
      email: 'alice@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'Distributed systems architect & PostgreSQL enthusiast. Passionate about transactional integrity.',
      skills: ['Node.js', 'PostgreSQL', 'Docker', 'Prisma', 'Redis'],
      timezone: 'America/New_York',
      githubUrl: 'https://github.com/alice-raceproof',
    },
    {
      name: 'Bob Miller',
      email: 'bob@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'Full-stack engineer with React & TypeScript focus. Loves building slick dashboard UIs.',
      skills: ['React', 'TypeScript', 'Tailwind CSS', 'Vite', 'GraphQL'],
      timezone: 'America/Chicago',
      githubUrl: 'https://github.com/bob-frontend',
    },
    {
      name: 'Charlie Zhang',
      email: 'charlie@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'DevOps engineer and database administrator. Specializes in ACID guarantees and high throughput.',
      skills: ['PostgreSQL', 'Linux', 'Kubernetes', 'CI/CD', 'Bash'],
      timezone: 'America/Los_Angeles',
      githubUrl: 'https://github.com/charlie-devops',
    },
    {
      name: 'Diana Prince',
      email: 'diana@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'Senior backend developer. Exploring real-time event streaming and SSE architectures.',
      skills: ['Node.js', 'Express', 'Python', 'Kafka', 'System Design'],
      timezone: 'Europe/London',
      githubUrl: 'https://github.com/diana-backend',
    },
    {
      name: 'Ethan Hunt',
      email: 'ethan@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'Frontend developer and accessibility advocate. Clean responsive layouts only.',
      skills: ['React', 'JavaScript', 'CSS3', 'Web Accessibility', 'Jest'],
      timezone: 'America/New_York',
      githubUrl: 'https://github.com/ethan-ui',
    },
    {
      name: 'Fiona Gallagher',
      email: 'fiona@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'Security researcher and backend engineer. Enforces secure cookies, RBAC, and input sanitization.',
      skills: ['Cybersecurity', 'JWT', 'OAuth', 'Node.js', 'PostgreSQL'],
      timezone: 'America/New_York',
      githubUrl: 'https://github.com/fiona-sec',
    },
    {
      name: 'George Clark',
      email: 'george@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'Data engineer and analytics hacker. Specializes in aggregation pipelines and concurrency testing.',
      skills: ['Python', 'SQL', 'Data Modeling', 'k6', 'Docker'],
      timezone: 'America/Detroit',
      githubUrl: 'https://github.com/george-data',
    },
    {
      name: 'Hannah Abbott',
      email: 'hannah@raceproof.dev',
      passwordHash: defaultPasswordHash,
      bio: 'Cloud native specialist with AWS & GCP expertise. Team formation coordinator.',
      skills: ['Go', 'Docker', 'AWS', 'PostgreSQL', 'Microservices'],
      timezone: 'UTC',
      githubUrl: 'https://github.com/hannah-cloud',
    },
  ];

  const createdUsers = [];
  for (const u of usersData) {
    const user = await prisma.user.create({ data: u });
    createdUsers.push(user);
  }
  console.log(`👤 Created ${createdUsers.length} sample users (Password for all: Password123!)`);

  // 4. Create Hackathon
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1); // started yesterday
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 5); // ends in 5 days

  const hackathon = await prisma.hackathon.create({
    data: {
      name: 'Global Concurrency & Cloud Hackathon 2026',
      description:
        'A high-intensity 48-hour engineering sprint building race-condition-safe, scalable web applications and distributed architectures.',
      startDate,
      endDate,
    },
  });
  console.log(`🏆 Created Hackathon: "${hackathon.name}"`);

  // 5. Create Team 1: "Team Distributed" (3 members, 1 slot left - Critical Test Team!)
  const team1 = await prisma.team.create({
    data: {
      name: 'Team Distributed',
      description:
        'Building a zero-conflict distributed ledger and high-throughput locking prototype. Looking for 1 final backend/DB engineer!',
      hackathonId: hackathon.id,
      leaderId: createdUsers[0].id, // Alice
      minSize: 2,
      maxSize: 4,
      requiredSkills: ['PostgreSQL', 'Docker', 'System Design'],
      status: 'ACTIVE',
    },
  });

  // Add 3 members: Alice (leader), Bob (member), Charlie (member)
  await prisma.teamMember.createMany({
    data: [
      {
        teamId: team1.id,
        hackathonId: hackathon.id,
        userId: createdUsers[0].id,
        role: 'LEADER',
      },
      {
        teamId: team1.id,
        hackathonId: hackathon.id,
        userId: createdUsers[1].id,
        role: 'MEMBER',
      },
      {
        teamId: team1.id,
        hackathonId: hackathon.id,
        userId: createdUsers[2].id,
        role: 'MEMBER',
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: createdUsers[0].id,
      teamId: team1.id,
      action: 'TEAM_CREATED',
      metadata: { name: team1.name, minSize: 2, maxSize: 4 },
    },
  });
  console.log('⚡ Created Team 1: "Team Distributed" (3/4 members, 1 seat open)');

  // 6. Create Team 2: "Team Quantum" (2 members, 2 slots left)
  const team2 = await prisma.team.create({
    data: {
      name: 'Team Quantum',
      description:
        'Developing real-time collaborative state synchronization with operational transforms. Seeking React and Node experts.',
      hackathonId: hackathon.id,
      leaderId: createdUsers[3].id, // Diana
      minSize: 2,
      maxSize: 4,
      requiredSkills: ['React', 'TypeScript', 'Node.js'],
      status: 'ACTIVE',
    },
  });

  await prisma.teamMember.createMany({
    data: [
      {
        teamId: team2.id,
        hackathonId: hackathon.id,
        userId: createdUsers[3].id,
        role: 'LEADER',
      },
      {
        teamId: team2.id,
        hackathonId: hackathon.id,
        userId: createdUsers[4].id,
        role: 'MEMBER',
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: createdUsers[3].id,
      teamId: team2.id,
      action: 'TEAM_CREATED',
      metadata: { name: team2.name, minSize: 2, maxSize: 4 },
    },
  });
  console.log('⚡ Created Team 2: "Team Quantum" (2/4 members, 2 seats open)');

  // 7. Create Pending Join Requests on Team 1 (from Fiona and George)
  await prisma.joinRequest.create({
    data: {
      teamId: team1.id,
      userId: createdUsers[5].id, // Fiona
      status: 'PENDING',
      message: 'Hi Alice! I have 4 years of experience hardening API security and SQL transactions. Would love to join!',
    },
  });

  await prisma.joinRequest.create({
    data: {
      teamId: team1.id,
      userId: createdUsers[6].id, // George
      status: 'PENDING',
      message: 'Hey team, I specialize in k6 load testing and database performance tuning. Let me help you win!',
    },
  });
  console.log('📩 Created 2 sample pending join requests for "Team Distributed"');

  console.log('✅ Database seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
