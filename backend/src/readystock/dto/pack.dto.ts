import { IsNumber, Min } from 'class-validator';

export class PackQtyDto {
  @IsNumber() @Min(0.001) qty!: number;
}
