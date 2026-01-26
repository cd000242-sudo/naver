/**
 * 응답 포맷터
 */

import { ActionButton, FormattedResponse, AIPersona, AgentError } from './types.js';
import { DEFAULT_PERSONA } from './persona.js';

export class ResponseFormatter {
  private persona: AIPersona;
  
  constructor(persona: AIPersona = DEFAULT_PERSONA) {
    this.persona = persona;
  }
  
  // 단계별 가이드 포맷
  formatSteps(steps: string[]): string {
    return steps.map((step, i) => {
      // 이미 번호가 있으면 그대로, 없으면 추가
      if (/^\d+[.)]/.test(step.trim())) {
        return step;
      }
      return `${i + 1}. ${step}`;
    }).join('\n');
  }
  
  // 팁 포맷
  formatTip(tip: string): string {
    if (tip.startsWith('💡')) {
      return tip;
    }
    return `💡 **Tip**: ${tip}`;
  }
  
  // 팁 목록 포맷
  formatTips(tips: string[]): string {
    return tips.map(tip => this.formatTip(tip)).join('\n');
  }
  
  // 불릿 리스트 포맷
  formatBulletList(items: string[]): string {
    return items.map(item => `• ${item}`).join('\n');
  }
  
  // 액션 버튼 포함 응답
  formatWithActions(message: string, actions: ActionButton[]): FormattedResponse {
    return {
      message,
      actions,
      type: 'with_actions'
    };
  }
  
  // 진행 상황 포맷
  formatProgress(step: string, current: number, total: number): string {
    const percentage = Math.round((current / total) * 100);
    const bar = this.generateProgressBar(percentage);
    return `${step}\n${bar} ${percentage}%`;
  }
  
  // 진행 바 생성
  private generateProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
  
  // 에러 메시지 포맷 (사용자 친화적)
  formatError(error: Error | AgentError, context?: string): string {
    const userMessage = this.getErrorUserMessage(error);
    const suggestion = this.getErrorSuggestion(error);
    
    let response = `❌ ${userMessage}`;
    if (suggestion) {
      response += `\n\n${suggestion}`;
    }
    return response;
  }
  
  // 에러 메시지 매핑
  private getErrorUserMessage(error: Error | AgentError): string {
    const message = error.message || '';
    
    const errorMap: Record<string, string> = {
      'API_KEY_INVALID': 'API 키가 올바르지 않아요.',
      'RATE_LIMIT': '요청이 너무 많아요. 잠시 후 다시 시도해주세요.',
      'NETWORK_ERROR': '인터넷 연결을 확인해주세요.',
      'CONTENT_BLOCKED': '콘텐츠 정책에 위반되어 생성할 수 없어요.',
      'TIMEOUT': '응답 시간이 너무 오래 걸려요.',
      '503': '서버가 일시적으로 바빠요. 잠시 후 다시 시도해주세요.',
      '429': '요청 한도를 초과했어요. 잠시 후 다시 시도해주세요.',
      '401': 'API 키 인증에 실패했어요.',
      '400': '요청 형식에 문제가 있어요.'
    };
    
    // 에러 맵에서 찾기
    for (const [key, value] of Object.entries(errorMap)) {
      if (message.includes(key)) {
        return value;
      }
    }
    
    return '문제가 발생했어요.';
  }
  
  // 에러 해결 제안
  private getErrorSuggestion(error: Error | AgentError): string | null {
    const message = error.message || '';
    
    const suggestionMap: Record<string, string> = {
      'API_KEY_INVALID': '💡 환경설정에서 API 키를 다시 확인해주세요.',
      'RATE_LIMIT': '💡 1분 후에 다시 시도해보세요.',
      'NETWORK_ERROR': '💡 Wi-Fi나 데이터 연결 상태를 확인해주세요.',
      '503': '💡 Gemini 서버가 불안정해요. 잠시 후 다시 시도해주세요.',
      '429': '💡 일일 무료 사용량을 초과했을 수 있어요.',
      '401': '💡 환경설정에서 API 키를 다시 확인해주세요.'
    };
    
    for (const [key, value] of Object.entries(suggestionMap)) {
      if (message.includes(key)) {
        return value;
      }
    }
    
    return null;
  }
  
  // 성공 응답 포맷
  formatSuccess(message: string, data?: any): FormattedResponse {
    return {
      message: `✅ ${message}`,
      type: 'text'
    };
  }
  
  // 경고 응답 포맷
  formatWarning(message: string): string {
    return `⚠️ ${message}`;
  }
  
  // 정보 응답 포맷
  formatInfo(message: string): string {
    return `ℹ️ ${message}`;
  }
  
  // 지식 항목을 응답으로 포맷
  formatKnowledgeResponse(
    title: string,
    content: string,
    steps?: string[],
    tips?: string[]
  ): string {
    let response = content;
    
    if (steps && steps.length > 0) {
      response += '\n\n' + this.formatSteps(steps);
    }
    
    if (tips && tips.length > 0) {
      response += '\n\n' + this.formatTips(tips);
    }
    
    return response;
  }
  
  // 관련 주제 추천 포맷
  formatRelatedTopics(topics: string[]): string {
    if (topics.length === 0) return '';
    
    return `\n\n📚 관련 도움말:\n${this.formatBulletList(topics)}`;
  }
}

// 싱글톤 인스턴스
export const responseFormatter = new ResponseFormatter();
