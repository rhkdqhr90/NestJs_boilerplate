import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { OrphanCleanupService } from './orphan-cleanup.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, OrphanCleanupService],
  exports: [UploadsService, OrphanCleanupService],
})
export class UploadsModule {}
