/**
 * 에이전트 베이스 클래스
 * Refactored: 제네릭 TInput 지원 + callGemini 의존성 분리
 */

import { AgentResult, AgentError, GeminiCallOptions, ActionButton } from './types.js';
import { ChatContext } from './chatContext.js';
import { ResponseFormatter } from './responseFormatter.js';
import { generateBlogContent } from '../gemini.js';

/**
 * BaseAgent - 모든 에이전트의 추상 베이스 클래스
 * 
 * @template TInput - execute 메서드의 입력 타입 (기본값: string)
 * 
 * @example
 * // 문자열 입력 에이전트
 * class MyAgent extends BaseAgent<string> { ... }
 * 
 * // 구조화된 입력 에이전트
 * interface MyInput { keyword: string; count: number; }
 * class MyAgent extends BaseAgent<MyInput> { ... }
 */
export abstract class BaseAgent<TInput = string> {
  /** 에이전트 이름 (로깅/체인 추적용) */
  abstract name: string;

  /** 에이전트 설명 */
  abstract description: string;

  /** Gemini 호출 시 사용할 시스템 프롬프트 */
  abstract systemPrompt: string;

  protected context: ChatContext;
  protected formatter: ResponseFormatter;

  constructor(context: ChatContext) {
    this.context = context;
    this.formatter = new ResponseFormatter();
  }

  // ===== 메인 실행 메서드 (서브클래스에서 구현) =====

  /**
   * 에이전트 메인 실행 메서드
   * @param input - TInput 타입의 입력값
   * @returns 에이전트 결과
   */
  abstract execute(input: TInput): Promise<AgentResult>;

  // ===== AI 호출 메서드 =====

  /**
   * Gemini API 호출 (범용 AI 호출 추상화)
   * - 내부적으로 generateBlogContent를 사용하지만,
   * - BaseAgent 관점에서는 '프롬프트 → AI 응답' 추상화로 취급
   */
  protected async callGemini(
    prompt: string,
    options?: GeminiCallOptions
  ): Promise<string> {
    const fullPrompt = `${this.systemPrompt}\n\n사용자: ${prompt}`;

    try {
      const result: any = await generateBlogContent(fullPrompt, {
        wordCount: options?.maxTokens || 2000
      });

      // 문자열 응답 처리
      if (typeof result === 'string') {
        return result;
      }

      // GenerateResult 객체 처리
      if (result?.content) {
        return result.content;
      }

      throw new Error('Gemini 응답 형식이 올바르지 않습니다.');
    } catch (error) {
      this.log(`AI 호출 실패: ${error}`, 'error');
      throw error;
    }
  }

  // ===== 로깅 =====

  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    console.log(`[${this.name}] [${level.toUpperCase()}] ${message}`);
    this.context.addLog({
      agent: this.name,
      message,
      level
    });
  }

  // ===== 결과 생성 헬퍼 =====

  /**
   * 에러 객체 생성
   */
  protected createError(
    code: string,
    message: string,
    recoverable: boolean = true,
    suggestion?: string
  ): AgentError {
    return { code, message, recoverable, suggestion };
  }

  /**
   * 성공 결과 생성
   */
  protected success(
    response: string,
    options?: {
      data?: any;
      actions?: ActionButton[];
      suggestFollowUp?: string[];
    }
  ): AgentResult {
    return {
      success: true,
      response,
      data: options?.data,
      actions: options?.actions,
      suggestFollowUp: options?.suggestFollowUp,
      metadata: {
        processingTime: 0,
        agentChain: [this.name]
      }
    };
  }

  /**
   * 실패 결과 생성
   */
  protected failure(error: AgentError): AgentResult {
    return {
      success: false,
      error,
      metadata: {
        processingTime: 0,
        agentChain: [this.name]
      }
    };
  }

  // ===== 액션 헬퍼 =====

  /**
   * 액션 버튼 생성
   */
  protected createAction(
    id: string,
    label: string,
    action: string,
    options?: { icon?: string; primary?: boolean; data?: any }
  ): ActionButton {
    return {
      id,
      label,
      action,
      icon: options?.icon,
      primary: options?.primary,
      data: options?.data
    };
  }
}
