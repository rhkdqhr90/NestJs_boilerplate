import { Module, forwardRef } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { JobAutoCloseService } from './job-auto-close.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [NotificationsModule, forwardRef(() => UploadsModule)],
  controllers: [PostsController],
  providers: [PostsService, JobAutoCloseService],
  exports: [PostsService],
})
export class PostsModule {}
