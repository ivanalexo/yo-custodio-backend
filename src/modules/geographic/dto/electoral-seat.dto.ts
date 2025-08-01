import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsMongoId,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateElectoralSeatDto {
  @ApiProperty({ example: '4116', description: 'ID de localización original' })
  @IsString()
  @IsNotEmpty()
  idLoc: string;

  @ApiProperty({
    example: 'Alto Ipaguazu',
    description: 'Nombre del asiento electoral',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'ID del municipio',
  })
  @IsMongoId()
  municipalityId: string;

  @ApiProperty({ example: true, description: 'Estado activo', required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateElectoralSeatDto {
  @ApiProperty({
    example: '4116',
    description: 'ID de localización original',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idLoc?: string;

  @ApiProperty({
    example: 'Alto Ipaguazu',
    description: 'Nombre del asiento electoral',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'ID del municipio',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  municipalityId?: string;

  @ApiProperty({ example: true, description: 'Estado activo', required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
