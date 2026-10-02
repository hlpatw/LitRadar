import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RecWeightsDto {
  @IsOptional() @IsNumber() @Min(0) @Max(1) interest?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) lexical?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) source?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) freshness?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) abstract?: number;
}

export class UpdateSettingsDto {
  @IsOptional() @IsString() fieldOfStudy?: string;
  @IsOptional() @IsString() interestedKeywords?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecWeightsDto)
  recWeights?: RecWeightsDto;
}
