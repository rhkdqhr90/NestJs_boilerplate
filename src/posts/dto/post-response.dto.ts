import { Post, PostCategory, JobSubCategory, Region, SalaryType, EmploymentType } from '@prisma/client';

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
    jobType: string | null;
    career: number | null;
    isVerified: boolean;
  } | null;

  // 구인공고 전용 필드 (기존)
  jobSubCategory: JobSubCategory | null;
  region: Region | null;
  salaryType: SalaryType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  isRecruiting: boolean;

  // 1순위: 핵심 채용 정보
  organizationName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactKakao: string | null;
  deadline: Date | null;
  isAutoClose: boolean;
  recruitCount: number | null;
  workingHours: string | null;

  // 2순위: 상세 정보
  employmentType: EmploymentType | null;
  benefits: string | null;
  requirements: string | null;
  detailAddress: string | null;

  createdAt: Date;
  updatedAt: Date;

  constructor(post: Post & { author?: any; _count?: { applications?: number } }) {
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

    // 구인공고 필드 (기존)
    this.jobSubCategory = post.jobSubCategory;
    this.region = post.region;
    this.salaryType = post.salaryType;
    this.salaryMin = post.salaryMin;
    this.salaryMax = post.salaryMax;
    this.isRecruiting = post.isRecruiting;

    // 1순위: 핵심 채용 정보
    this.organizationName = post.organizationName;
    this.contactPhone = post.contactPhone;
    this.contactEmail = post.contactEmail;
    this.contactKakao = post.contactKakao;
    this.deadline = post.deadline;
    this.isAutoClose = post.isAutoClose;
    this.recruitCount = post.recruitCount;
    this.workingHours = post.workingHours;

    // 2순위: 상세 정보
    this.employmentType = post.employmentType;
    this.benefits = post.benefits;
    this.requirements = post.requirements;
    this.detailAddress = post.detailAddress;

    // 익명 게시글이면 작성자 정보 숨김
    if (post.isAnonymous || !post.author) {
      this.author = null;
    } else {
      this.author = {
        id: post.author.id,
        nickname: post.author.nickname,
        profileImage: post.author.profileImage,
        jobType: post.author.jobType,
        career: post.author.career,
        isVerified: post.author.isVerified,
      };
    }
  }
}
