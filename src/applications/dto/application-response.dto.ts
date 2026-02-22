import { Application, ApplicationStatus } from '@prisma/client';

export class ApplicationResponseDto {
  id: string;
  postId: string;
  applicantId: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  resumeUrl: string | null;
  resumeFileName: string | null;
  recruiterNote: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  createdAt: Date;
  updatedAt: Date;

  // 관계 데이터
  post?: {
    id: string;
    title: string;
    organizationName: string | null;
    isRecruiting: boolean;
  };

  applicant?: {
    id: string;
    nickname: string;
    email: string;
    profileImage: string | null;
    jobType: string | null;
    career: number | null;
  };

  constructor(
    application: Application & {
      post?: any;
      applicant?: any;
    },
  ) {
    this.id = application.id;
    this.postId = application.postId;
    this.applicantId = application.applicantId;
    this.status = application.status;
    this.coverLetter = application.coverLetter;
    this.resumeUrl = application.resumeUrl;
    this.resumeFileName = application.resumeFileName;
    this.recruiterNote = application.recruiterNote;
    this.contactPhone = application.contactPhone;
    this.contactEmail = application.contactEmail;
    this.createdAt = application.createdAt;
    this.updatedAt = application.updatedAt;

    if (application.post) {
      this.post = {
        id: application.post.id,
        title: application.post.title,
        organizationName: application.post.organizationName,
        isRecruiting: application.post.isRecruiting,
      };
    }

    if (application.applicant) {
      this.applicant = {
        id: application.applicant.id,
        nickname: application.applicant.nickname,
        email: application.applicant.email,
        profileImage: application.applicant.profileImage,
        jobType: application.applicant.jobType,
        career: application.applicant.career,
      };
    }
  }
}
