import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, Min, Max, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

class CommentPaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 50;
}

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // ✅ Rate Limit: 댓글 작성 30회/분
  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('postId') postId: string,
    @Req() req: Request,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    const user = req.user as JwtPayload;
    return this.commentsService.create(postId, user.sub, createCommentDto);
  }

  @Get('posts/:postId/comments')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async findAllByPost(
    @Param('postId') postId: string,
    @Query() pagination: CommentPaginationDto,
  ) {
    return this.commentsService.findAllByPost(
      postId,
      pagination.page,
      pagination.limit,
    );
  }

  @Patch('comments/:id')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() updateCommentDto: UpdateCommentDto,
  ) {
    const user = req.user as JwtPayload;
    return this.commentsService.update(id, user.sub, updateCommentDto);
  }

  // ✅ Rate Limit: 댓글 삭제 10회/분
  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.commentsService.remove(id, user.sub);
  }
}
