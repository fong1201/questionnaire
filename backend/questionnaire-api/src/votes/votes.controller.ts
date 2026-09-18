import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { COUNTRIES, MAX_SELECTIONS, type SubmitVoteResult } from '@questionnaire/shared';
import { SubmitVoteDto } from './submit-vote.dto.js';
import { VotesService } from './votes.service.js';

@Controller()
export class VotesController {
  constructor(private readonly votes: VotesService) {}

  /** Options for the questionnaire form. Static, so browsers and CloudFront may cache it. */
  @Get('countries')
  @Header('Cache-Control', 'public, max-age=300')
  countries() {
    return { maxSelections: MAX_SELECTIONS, countries: COUNTRIES };
  }

  /** 202: the ballot is queued and will appear on the dashboard within seconds. */
  @Post('votes')
  @HttpCode(HttpStatus.ACCEPTED)
  submit(@Body() body: SubmitVoteDto): Promise<SubmitVoteResult> {
    return this.votes.submit(body);
  }
}
