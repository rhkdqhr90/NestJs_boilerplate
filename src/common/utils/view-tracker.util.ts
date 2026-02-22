/**
 * 메모리 기반 조회수 중복 방지 유틸리티
 *
 * - IP + PostId 조합으로 10분 내 중복 조회 방지
 * - 메모리 캐시 사용 (서버 재시작 시 초기화)
 * - 프로덕션에서는 Redis 사용 권장
 */

interface ViewRecord {
  timestamp: number;
}

class ViewTracker {
  private cache: Map<string, ViewRecord> = new Map();
  private readonly TTL_MS = 10 * 60 * 1000; // 10분
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5분마다 정리
  private readonly MAX_CACHE_SIZE = 100000; // 최대 10만 개 레코드 (메모리 보호)
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 주기적으로 만료된 레코드 정리
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
    // unref: 이 타이머만 남았을 때 프로세스 종료 허용 (graceful shutdown 지원)
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 조회수를 증가시켜야 하는지 확인
   * @param postId 게시글 ID
   * @param ipHash 해시된 IP 주소
   * @returns true면 조회수 증가, false면 중복 조회
   */
  shouldIncrementView(postId: string, ipHash: string): boolean {
    const key = `${postId}:${ipHash}`;
    const now = Date.now();
    const record = this.cache.get(key);

    if (record && now - record.timestamp < this.TTL_MS) {
      // 아직 TTL 내 - 중복 조회
      return false;
    }

    // 캐시 크기 제한 체크 - 최대 크기 도달 시 가장 오래된 레코드 정리
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestRecords();
    }

    // 새 조회 기록
    this.cache.set(key, { timestamp: now });
    return true;
  }

  /**
   * 캐시가 가득 찼을 때 가장 오래된 레코드 10% 제거
   */
  private evictOldestRecords(): void {
    const entries = Array.from(this.cache.entries());
    // 타임스탬프 기준 오름차순 정렬 (오래된 것 먼저)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 10% 제거
    const evictCount = Math.ceil(this.MAX_CACHE_SIZE * 0.1);
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * 만료된 레코드 정리
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.cache.entries()) {
      if (now - record.timestamp >= this.TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 리소스 정리 (서버 종료 시 호출)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }

  /**
   * 캐시 크기 조회 (디버깅용)
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// 싱글톤 인스턴스
export const viewTracker = new ViewTracker();
