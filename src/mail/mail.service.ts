import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 */
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

@Injectable()
export class MailService {
  private transporter: Transporter;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly frontendUrl: string;

  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.fromEmail =
      this.configService.get<string>('MAIL_FROM') || 'noreply@teacher-shelter.com';
    this.fromName = this.configService.get<string>('MAIL_FROM_NAME') || '교사쉼터';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    // SMTP 설정 (개발/프로덕션 환경별 분기)
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT') || 587;
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass) {
      // 프로덕션: 실제 SMTP 서버 사용
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    } else {
      // 개발: Ethereal (가상 이메일) 또는 콘솔 출력
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'ethereal.user@ethereal.email',
          pass: 'ethereal.pass',
        },
      });

      if (process.env.NODE_ENV === 'development') {
        this.logger.log('Using development mode - emails will be logged', 'MailService');
      }
    }
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    nickname: string,
  ): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
          .content { padding: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
          .footer { padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          .warning { background-color: #FEF3C7; padding: 12px; border-radius: 6px; margin-top: 20px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏫 교사쉼터</h1>
          </div>
          <div class="content">
            <p>안녕하세요, <strong>${escapeHtml(nickname)}</strong>님!</p>
            <p>비밀번호 재설정을 요청하셨습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" class="button">비밀번호 재설정</a>
            </p>
            <p>버튼이 작동하지 않으면 아래 링크를 브라우저에 복사해서 붙여넣으세요:</p>
            <p style="word-break: break-all; color: #4F46E5;">${resetUrl}</p>
            <div class="warning">
              ⚠️ 이 링크는 <strong>1시간</strong> 후에 만료됩니다.<br>
              비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하셔도 됩니다.
            </div>
          </div>
          <div class="footer">
            <p>본 메일은 발신 전용입니다.</p>
            <p>© ${new Date().getFullYear()} 교사쉼터. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: '[교사쉼터] 비밀번호 재설정',
      html,
    };

    // 개발 환경에서는 로그 출력
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEBUG] Password Reset Email - To: ${email}, Reset URL: ${resetUrl}`, 'MailService');
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);

      if (process.env.NODE_ENV === 'development') {
        // Ethereal 미리보기 URL
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          this.logger.log(`[DEBUG] Preview URL: ${previewUrl}`, 'MailService');
        }
      }
    } catch (error) {
      // 개발 환경에서는 이메일 전송 실패해도 로깅만
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn?.(`Failed to send email: ${error}. Continuing anyway in development mode`, 'MailService');
      } else {
        throw error;
      }
    }
  }

  /**
   * 6자리 인증 코드 이메일 발송
   */
  async sendEmailVerificationCode(
    email: string,
    code: string,
    nickname: string,
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
          .content { padding: 30px 0; }
          .code-box { text-align: center; margin: 30px 0; }
          .code { display: inline-block; padding: 16px 32px; background-color: #F3F4F6; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4F46E5; font-family: monospace; }
          .footer { padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          .warning { background-color: #FEF3C7; padding: 12px; border-radius: 6px; margin-top: 20px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏫 교사쉼터</h1>
          </div>
          <div class="content">
            <p>안녕하세요, <strong>${escapeHtml(nickname)}</strong>님!</p>
            <p>교사쉼터 회원가입을 완료하려면 아래 인증 코드를 입력해주세요.</p>
            <div class="code-box">
              <span class="code">${code}</span>
            </div>
            <div class="warning">
              ⚠️ 이 코드는 <strong>10분</strong> 후에 만료됩니다.<br>
              본인이 요청하지 않았다면 이 이메일을 무시하세요.
            </div>
          </div>
          <div class="footer">
            <p>본 메일은 발신 전용입니다.</p>
            <p>© ${new Date().getFullYear()} 교사쉼터. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: '[교사쉼터] 이메일 인증',
      html,
    };

    // 개발 환경에서는 로그 출력
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEBUG] Email Verification Code - To: ${email}, Code: ${code}`, 'MailService');
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);

      if (process.env.NODE_ENV === 'development') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          this.logger.log(`[DEBUG] Preview URL: ${previewUrl}`, 'MailService');
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn?.(`Failed to send email: ${error}. Continuing anyway in development mode`, 'MailService');
      } else {
        throw error;
      }
    }
  }

  /**
   * 문의 접수 알림 (관리자에게)
   */
  async sendInquiryNotification(inquiry: {
    id: string;
    type: string;
    email: string;
    subject: string;
    content: string;
  }): Promise<void> {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL') || this.fromEmail;
    const inquiryTypeLabels: Record<string, string> = {
      GENERAL: '일반 문의',
      ACCOUNT: '계정 관련',
      REPORT: '신고/불편 사항',
      SUGGESTION: '서비스 제안',
      PARTNERSHIP: '제휴/협력 문의',
      OTHER: '기타',
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
          .content { padding: 30px 0; }
          .info-box { background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 20px 0; }
          .info-row { margin: 8px 0; }
          .label { font-weight: 600; color: #666; }
          .footer { padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏫 교사쉼터 - 새 문의 접수</h1>
          </div>
          <div class="content">
            <p>새로운 고객 문의가 접수되었습니다.</p>
            <div class="info-box">
              <div class="info-row"><span class="label">문의 ID:</span> ${escapeHtml(inquiry.id)}</div>
              <div class="info-row"><span class="label">유형:</span> ${escapeHtml(inquiryTypeLabels[inquiry.type] || inquiry.type)}</div>
              <div class="info-row"><span class="label">이메일:</span> ${escapeHtml(inquiry.email)}</div>
              <div class="info-row"><span class="label">제목:</span> ${escapeHtml(inquiry.subject)}</div>
            </div>
            <p><strong>내용:</strong></p>
            <p style="white-space: pre-wrap; background: #f9f9f9; padding: 16px; border-radius: 8px;">${escapeHtml(inquiry.content)}</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} 교사쉼터. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: adminEmail,
      subject: `[교사쉼터 문의] ${inquiry.subject}`,
      html,
    };

    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEBUG] New Inquiry - ID: ${inquiry.id}, Type: ${inquiry.type}, From: ${inquiry.email}, Subject: ${inquiry.subject}`, 'MailService');
    }

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn?.(`Failed to send inquiry notification: ${error}`, 'MailService');
      } else {
        throw error;
      }
    }
  }

  /**
   * 문의 답변 발송 (사용자에게)
   */
  async sendInquiryResponse(inquiry: {
    email: string;
    subject: string;
    content: string;
    response: string | null;
  }): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
          .content { padding: 30px 0; }
          .original { background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #666; }
          .response { background-color: #EEF2FF; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5; }
          .footer { padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏫 교사쉼터</h1>
          </div>
          <div class="content">
            <p>안녕하세요!</p>
            <p>문의하신 내용에 대해 답변 드립니다.</p>

            <p><strong>원본 문의:</strong></p>
            <div class="original">
              <p><strong>${escapeHtml(inquiry.subject)}</strong></p>
              <p style="white-space: pre-wrap;">${escapeHtml(inquiry.content)}</p>
            </div>

            <p><strong>답변:</strong></p>
            <div class="response">
              <p style="white-space: pre-wrap;">${escapeHtml(inquiry.response || '')}</p>
            </div>

            <p>추가 문의사항이 있으시면 언제든 연락해 주세요.</p>
            <p>감사합니다.</p>
          </div>
          <div class="footer">
            <p>본 메일은 발신 전용입니다.</p>
            <p>© ${new Date().getFullYear()} 교사쉼터. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: inquiry.email,
      subject: `[교사쉼터] 문의 답변: ${inquiry.subject}`,
      html,
    };

    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEBUG] Inquiry Response - To: ${inquiry.email}, Subject: ${inquiry.subject}`, 'MailService');
    }

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn?.(`Failed to send inquiry response: ${error}`, 'MailService');
      } else {
        throw error;
      }
    }
  }
}
