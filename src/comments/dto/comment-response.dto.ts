import { Comment } from '@prisma/client';

// Prisma include 결과 타입 정의
export type CommentWithRelations = Comment & {
  author?: {
    id: string;
    nickname: string;
    profileImage: string | null;
  } | null;
  mentionedUser?: {
    id: string;
    nickname: string;
  } | null;
  replies?: CommentWithRelations[];
};

export class CommentResponseDto {
  id: string;
  content: string;

  // 작성자
  author: {
    id: string;
    nickname: string;
    profileImage: string | null;
  } | null;

  // 멘션된 유저 (있으면)
  mentionedUser: {
    id: string;
    nickname: string;
  } | null;

  // 부모 댓글 ID (대댓글인 경우)
  parentCommentId: string | null;

  // 답글 목록 (1 depth만)
  replies?: CommentResponseDto[];

  createdAt: Date;
  updatedAt: Date;

  constructor(comment: CommentWithRelations) {
    this.id = comment.id;
    this.content = comment.content;
    this.parentCommentId = comment.parentCommentId;
    this.createdAt = comment.createdAt;
    this.updatedAt = comment.updatedAt;

    // 작성자
    this.author = comment.author
      ? {
          id: comment.author.id,
          nickname: comment.author.nickname,
          profileImage: comment.author.profileImage,
        }
      : null;

    // 멘션된 유저
    this.mentionedUser = comment.mentionedUser
      ? {
          id: comment.mentionedUser.id,
          nickname: comment.mentionedUser.nickname,
        }
      : null;

    // 답글 (재귀 방지 - 1 depth만)
    if (comment.replies && !comment.parentCommentId) {
      this.replies = comment.replies.map(
        (reply) => new CommentResponseDto(reply),
      );
    }
  }
}
