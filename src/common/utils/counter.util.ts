import { Prisma } from '@prisma/client';

/**
 * 비정규화 카운터 안전 감소 유틸리티
 * GREATEST(0, column - N) SQL을 사용하여 음수 방지
 *
 * Prisma의 decrement는 0 미만으로 내려갈 수 있으므로,
 * 프로덕션에서는 이 유틸리티를 사용해야 합니다.
 */

type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * Post의 commentCount를 안전하게 감소 (최소 0)
 */
export async function safeDecrementCommentCount(
  tx: PrismaTransactionClient,
  postId: string,
  decrementBy: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Post"
    SET "commentCount" = GREATEST(0, "commentCount" - ${decrementBy})
    WHERE "id" = ${postId}
  `;
}

/**
 * Post의 likeCount를 안전하게 감소 (최소 0)
 */
export async function safeDecrementLikeCount(
  tx: PrismaTransactionClient,
  postId: string,
  decrementBy: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Post"
    SET "likeCount" = GREATEST(0, "likeCount" - ${decrementBy})
    WHERE "id" = ${postId}
  `;
}
