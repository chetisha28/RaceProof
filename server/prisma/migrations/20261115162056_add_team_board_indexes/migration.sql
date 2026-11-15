-- CreateIndex
CREATE INDEX "Team_createdAt_idx" ON "Team"("createdAt");

-- CreateIndex
CREATE INDEX "Team_hackathonId_status_createdAt_idx" ON "Team"("hackathonId", "status", "createdAt");
