import { PrismaClient, PostCategory, JobType, UserRole, ReportType, ReportStatus, User, Post } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// 한글 Lorem Ipsum 대용 문장들
const TITLES = {
  FREE: [
    '오늘 수업 시간에 있었던 일',
    '퇴근하고 나서 뭐하세요?',
    '점심 메뉴 추천해주세요',
    '오늘 날씨가 너무 좋아요',
    '주말에 뭐 하실 예정이세요?',
    '커피 vs 차, 뭐가 더 좋으세요?',
    '요즘 읽고 있는 책 추천',
    '운동 같이 하실 분 계세요?',
    '퇴근 후 루틴이 궁금해요',
    '좋은 아침이에요!',
  ],
  ANONYMOUS: [
    '동료 교사와의 갈등이 힘들어요',
    '학부모 민원 때문에 스트레스받아요',
    '이직을 고민하고 있어요',
    '번아웃이 온 것 같아요',
    '선배 교사의 태도가 힘들어요',
    '아이들한테 화를 낸 것 같아 자책돼요',
    '월급이 너무 적은 것 같아요',
    '업무 분장이 불공평해요',
    '승진을 포기해야 할까요?',
    '다른 학교로 옮기고 싶어요',
  ],
  KNOWHOW: [
    '문제행동 지도 노하우 공유합니다',
    '학급 운영 팁 정리해봤어요',
    '효과적인 보상 시스템',
    '시간표 짜는 나만의 방법',
    '학부모 상담 잘 하는 법',
    'IEP 작성 꿀팁 모음',
    '교실 환경 구성 아이디어',
    '수업 자료 정리하는 방법',
    '행동 지원 계획 세우기',
    '신규 교사를 위한 조언',
  ],
  INFO: [
    '다음 달 연수 정보 공유',
    '특수교육 관련 법령 개정 안내',
    '무료 교육 자료 사이트 모음',
    '새로운 보조공학 기기 소개',
    '연차 사용 관련 안내',
    '교원 복지 제도 정리',
    '자격증 취득 정보',
    '공무원 연금 변경 사항',
    '교육청 공지사항 요약',
    '장애학생 지원 정책 업데이트',
  ],
  LEGAL_QNA: [
    '학부모가 녹음한다고 하는데 괜찮은 건가요?',
    '근무시간 외 업무 지시, 거부할 수 있나요?',
    '아이가 다쳤을 때 법적 책임은?',
    '학부모 폭언에 대한 대응 방법',
    '개인정보 관련 질문이요',
    '휴직 관련 법적 권리가 궁금해요',
    '계약직 교사의 권리',
    '학교폭력 관련 교사 역할',
    '아동학대 신고 의무 범위',
    '교권 침해 시 대응 절차',
  ],
};

const CONTENTS = {
  FREE: [
    '오늘 수업 시간에 아이들이랑 재미있는 활동을 했어요. 다들 즐거워하는 모습을 보니까 저도 기분이 좋아졌습니다. 이런 날이 더 많았으면 좋겠어요.',
    '퇴근하고 나면 너무 피곤해서 아무것도 못하겠어요. 다들 퇴근 후에 어떻게 시간 보내시나요? 취미 활동 추천해주세요!',
    '오늘 점심 메뉴 고민되네요. 근처에 맛있는 곳 있으면 추천해주세요. 요즘 뭐 드시나요?',
    '날씨가 정말 좋아서 기분이 좋아요. 이런 날은 야외 수업하면 좋을 것 같아요.',
    '주말에 뭐 하실 예정이세요? 저는 집에서 쉬려고 하는데, 밖에 나가는 것도 좋을 것 같아요.',
  ],
  ANONYMOUS: [
    '동료 교사와 업무 관련해서 의견 충돌이 있었어요. 제 방식이 틀린 건지 모르겠고, 대화를 시도해도 잘 안 되네요. 어떻게 해야 할까요?',
    '학부모가 계속 민원을 넣으시는데, 저도 최선을 다하고 있거든요. 스트레스가 너무 심해서 잠도 잘 못 자요.',
    '솔직히 이 일을 계속 해야 하나 고민이 돼요. 다른 분야로 이직하신 분 계신가요? 경험담 듣고 싶어요.',
    '최근 들어 출근하기가 너무 힘들어요. 번아웃인 것 같은데, 어떻게 극복하셨나요?',
    '선배 교사가 매번 저한테만 일을 미루는 것 같아요. 말씀드리기도 어렵고... 어떻게 해야 할까요?',
  ],
  KNOWHOW: [
    '문제행동 지도할 때 가장 중요한 건 일관성이에요. 그리고 행동의 기능을 파악하는 게 먼저입니다. 제가 사용하는 ABC 기록지 양식 공유드려요.',
    '학급 운영 10년 차입니다. 제가 깨달은 건 규칙은 간단할수록 좋다는 거예요. 3가지 이내로 정하고 꾸준히 적용하세요.',
    '보상 시스템은 아이마다 다르게 적용해야 해요. 저는 개별 강화인을 파악하는 데 첫 한 달을 투자합니다.',
    '시간표 짤 때 가장 집중이 잘 되는 오전에 중요한 수업 배치하세요. 오후는 활동 중심으로!',
    '학부모 상담 전에 긍정적인 내용을 먼저 정리해두세요. 좋은 점부터 말씀드리면 분위기가 훨씬 부드러워집니다.',
  ],
  INFO: [
    '다음 달에 ○○교육청에서 주최하는 연수가 있어요. 신청 기간이 곧 마감이니 관심 있으신 분들 참고하세요.',
    '특수교육법 일부 개정안이 발표되었습니다. 주요 내용 정리해서 공유드려요. 업무에 참고하세요.',
    '무료로 사용할 수 있는 교육 자료 사이트 모음입니다. 저도 자주 활용하고 있어요. 북마크해두세요!',
    '최근 출시된 보조공학 기기 사용 후기입니다. 학생들 반응이 좋아서 추천드려요.',
    '연차 사용 관련해서 최근 인사혁신처 유권해석이 나왔어요. 궁금하신 분들 참고하세요.',
  ],
  LEGAL_QNA: [
    '학부모가 상담 시간에 녹음한다고 하셨는데, 이게 법적으로 문제가 없는 건가요? 저도 동의해야 하는 건지 궁금합니다.',
    '퇴근 시간 지나서 업무 지시가 오는데, 이거 거부해도 되나요? 근무시간 외 업무 지시의 법적 기준이 궁금해요.',
    '활동 시간에 아이가 다쳤는데, 혹시 교사에게도 법적 책임이 있나요? 어떻게 대응해야 하는지 조언 부탁드려요.',
    '학부모님이 전화로 욕설을 하셨어요. 이런 경우 어떻게 대응해야 하나요? 법적으로 보호받을 수 있는 방법이 있을까요?',
    '학생 개인정보를 다른 기관에 제공해야 하는데, 동의서 양식이나 주의사항이 있을까요?',
  ],
};

const NICKNAMES = [
  '햇살가득', '푸른하늘', '달빛교사', '희망나무', '따뜻한마음',
  '별빛샘', '꿈꾸는교사', '행복전도사', '사랑가득', '웃음천사',
  '열정맘', '초록이파리', '바람처럼', '구름위의', '새벽이슬',
  '봄날의햇살', '가을바람', '겨울눈꽃', '여름소나기', '무지개빛',
];

async function main() {
  console.log('🌱 목 데이터 생성 시작...');

  // 0. 관리자 계정 생성
  const hashedPassword = await bcrypt.hash('Test1234!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      password: hashedPassword,
      nickname: '관리자',
      isVerified: true,
      role: UserRole.ADMIN,
      jobType: JobType.DIRECTOR,
      career: 15,
    },
  });
  console.log('✅ 관리자 계정 생성 완료 (admin@test.com / Test1234!)');

  // 1. 테스트 유저 생성 (10명)
  const users: User[] = [];

  for (let i = 0; i < 10; i++) {
    const jobTypes = Object.values(JobType);
    const user = await prisma.user.upsert({
      where: { email: `mock${i + 1}@test.com` },
      update: {},
      create: {
        email: `mock${i + 1}@test.com`,
        password: hashedPassword,
        nickname: NICKNAMES[i] || `테스트유저${i + 1}`,
        isVerified: true,
        jobType: jobTypes[i % jobTypes.length],
        career: Math.floor(Math.random() * 20) + 1,
      },
    });
    users.push(user);
  }
  console.log(`✅ ${users.length}명의 유저 생성 완료`);

  // 2. 게시글 100개 생성
  const categories = Object.values(PostCategory);
  const posts: Post[] = [];

  for (let i = 0; i < 100; i++) {
    const category = categories[i % categories.length];
    const titles = TITLES[category];
    const contents = CONTENTS[category];
    const isAnonymous = category === PostCategory.ANONYMOUS;
    const author = users[Math.floor(Math.random() * users.length)];

    // 랜덤 날짜 (최근 30일)
    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);
    createdAt.setHours(Math.floor(Math.random() * 24));
    createdAt.setMinutes(Math.floor(Math.random() * 60));

    const post = await prisma.post.create({
      data: {
        title: titles[Math.floor(Math.random() * titles.length)],
        content: contents[Math.floor(Math.random() * contents.length)],
        category,
        isAnonymous,
        authorId: author.id,
        viewCount: Math.floor(Math.random() * 500),
        likeCount: Math.floor(Math.random() * 50),
        commentCount: 0,
        createdAt,
        updatedAt: createdAt,
      },
    });
    posts.push(post);
  }
  console.log(`✅ ${posts.length}개의 게시글 생성 완료`);

  // 3. 댓글 생성 (일부 게시글에)
  let commentCount = 0;
  for (const post of posts.slice(0, 50)) { // 50개 게시글에 댓글 추가
    const numComments = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < numComments; i++) {
      const author = users[Math.floor(Math.random() * users.length)];
      await prisma.comment.create({
        data: {
          content: '좋은 글 감사합니다! 많은 도움이 되었어요.',
          postId: post.id,
          authorId: author.id,
        },
      });
      commentCount++;
    }

    // 댓글 수 업데이트
    await prisma.post.update({
      where: { id: post.id },
      data: { commentCount: numComments },
    });
  }
  console.log(`✅ ${commentCount}개의 댓글 생성 완료`);

  // 4. 좋아요 생성
  let likeCount = 0;
  for (const post of posts) {
    const numLikes = Math.min(post.likeCount, users.length);
    const shuffledUsers = [...users].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numLikes; i++) {
      try {
        await prisma.like.create({
          data: {
            postId: post.id,
            userId: shuffledUsers[i].id,
          },
        });
        likeCount++;
      } catch {
        // 중복 좋아요 무시
      }
    }
  }
  console.log(`✅ ${likeCount}개의 좋아요 생성 완료`);

  // 5. 북마크 생성
  let bookmarkCount = 0;
  for (const user of users.slice(0, 5)) { // 5명의 유저가 북마크
    const numBookmarks = Math.floor(Math.random() * 10) + 3;
    const shuffledPosts = [...posts].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numBookmarks; i++) {
      try {
        await prisma.bookmark.create({
          data: {
            userId: user.id,
            postId: shuffledPosts[i].id,
          },
        });
        bookmarkCount++;
      } catch {
        // 중복 북마크 무시
      }
    }
  }
  console.log(`✅ ${bookmarkCount}개의 북마크 생성 완료`);

  // 6. 신고 데이터 생성
  const reportReasons = [
    '부적절한 내용이 포함되어 있습니다.',
    '광고성 게시글입니다.',
    '욕설 및 비방이 포함되어 있습니다.',
    '허위 정보를 유포하고 있습니다.',
    '개인정보가 노출되어 있습니다.',
  ];

  let reportCount = 0;
  // 게시글 신고 5개
  for (let i = 0; i < 5; i++) {
    const reporter = users[i];
    const targetPost = posts[(i + 5) % posts.length]; // 다른 사람 게시글

    // 자기 게시글 신고 방지
    if (targetPost.authorId === reporter.id) continue;

    try {
      await prisma.report.create({
        data: {
          type: ReportType.POST,
          reason: reportReasons[i % reportReasons.length],
          reporterId: reporter.id,
          targetPostId: targetPost.id,
          status: i < 2 ? ReportStatus.PENDING : ReportStatus.REVIEWED,
          processedById: i >= 2 ? admin.id : null,
          processedAt: i >= 2 ? new Date() : null,
          processingNote: i >= 2 ? '검토 완료되었습니다.' : null,
        },
      });
      reportCount++;
    } catch {
      // 중복 신고 무시
    }
  }

  // 사용자 신고 3개
  for (let i = 0; i < 3; i++) {
    const reporter = users[i];
    const targetUser = users[(i + 5) % users.length]; // 다른 사람

    if (targetUser.id === reporter.id) continue;

    try {
      await prisma.report.create({
        data: {
          type: ReportType.USER,
          reason: '불쾌한 닉네임을 사용하고 있습니다.',
          reporterId: reporter.id,
          targetUserId: targetUser.id,
          status: ReportStatus.PENDING,
        },
      });
      reportCount++;
    } catch {
      // 중복 신고 무시
    }
  }
  console.log(`✅ ${reportCount}개의 신고 생성 완료`);

  // 7. 알림 생성
  let notificationCount = 0;
  for (const user of users.slice(0, 5)) {
    // 댓글 알림
    await prisma.notification.create({
      data: {
        type: 'COMMENT',
        userId: user.id,
        actorId: users[(users.indexOf(user) + 1) % users.length].id,
        postId: posts[Math.floor(Math.random() * posts.length)].id,
        isRead: Math.random() > 0.5,
      },
    });
    notificationCount++;

    // 좋아요 알림
    await prisma.notification.create({
      data: {
        type: 'LIKE',
        userId: user.id,
        actorId: users[(users.indexOf(user) + 2) % users.length].id,
        postId: posts[Math.floor(Math.random() * posts.length)].id,
        isRead: false,
      },
    });
    notificationCount++;
  }
  console.log(`✅ ${notificationCount}개의 알림 생성 완료`);

  console.log('\n🎉 목 데이터 생성 완료!');
  console.log(`   - 관리자: 1명 (admin@test.com)`);
  console.log(`   - 유저: ${users.length}명`);
  console.log(`   - 게시글: ${posts.length}개`);
  console.log(`   - 댓글: ${commentCount}개`);
  console.log(`   - 좋아요: ${likeCount}개`);
  console.log(`   - 북마크: ${bookmarkCount}개`);
  console.log(`   - 신고: ${reportCount}개`);
  console.log(`   - 알림: ${notificationCount}개`);
}

main()
  .catch((e) => {
    console.error('❌ 에러 발생:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
