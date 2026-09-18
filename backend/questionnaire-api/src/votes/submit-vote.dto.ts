import { COUNTRY_CODES, MAX_SELECTIONS, type SubmitVoteRequest } from '@questionnaire/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class SubmitVoteDto implements SubmitVoteRequest {
  @IsOptional()
  @IsUUID()
  ballotId?: string;

  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v)) : value,
  )
  @IsArray()
  @ArrayMinSize(1, { message: 'select at least one country' })
  @ArrayMaxSize(MAX_SELECTIONS, { message: `select at most ${MAX_SELECTIONS} countries` })
  @ArrayUnique({ message: 'countries must not repeat' })
  @IsIn(COUNTRY_CODES, { each: true, message: 'unknown country code: $value' })
  countries: string[];
}
