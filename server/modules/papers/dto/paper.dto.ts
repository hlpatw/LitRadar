import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePaperDto {
  @IsOptional()
  @IsString()
  journalId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsOptional() @IsString() authors?: string;
  @IsOptional() @IsString() @MaxLength(200) doi?: string;
  @IsOptional() @IsString() keywords?: string;
  @IsOptional() @IsString() abstractText?: string;
  @IsOptional() @IsString() methods?: string;
  @IsOptional() @IsString() conclusions?: string;
  @IsOptional() @IsDateString() publishedDate?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}

export class UpdatePaperDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) title?: string;
  @IsOptional() @IsString() authors?: string;
  @IsOptional() @IsString() @MaxLength(200) doi?: string;
  @IsOptional() @IsString() keywords?: string;
  @IsOptional() @IsString() abstractText?: string;
  @IsOptional() @IsString() methods?: string;
  @IsOptional() @IsString() conclusions?: string;
  @IsOptional() @IsDateString() publishedDate?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}
