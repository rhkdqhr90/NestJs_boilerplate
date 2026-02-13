import { Post, PostCategory } from '@prisma/client';

export class PostResponseDto {
  id: string;
  title: string;
  content: string;
  category: PostCategory;
  isAnonymous: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;

  // 작성자 정보 (익명이면 숨김)
  author: {
    id: string;
    nickname: string;
    profileImage: string | null;
  } | null;

  createdAt: Date;
  updatedAt: Date;

  constructor(post: Post & { author?: any }) {
    this.id = post.id;
    this.title = post.title;
    this.content = post.content;
    this.category = post.category;
    this.isAnonymous = post.isAnonymous;
    this.viewCount = post.viewCount;
    this.likeCount = post.likeCount;
    this.commentCount = post.commentCount;
    this.createdAt = post.createdAt;
    this.updatedAt = post.updatedAt;

    // 익명 게시글이면 작성자 정보 숨김
    if (post.isAnonymous || !post.author) {
      this.author = null;
    } else {
      this.author = {
        id: post.author.id,
        nickname: post.author.nickname,
        profileImage: post.author.profileImage,
      };
    }
  }
}
