import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BallotDocument = Ballot & Document;

@Schema({ _id: false })
export class Location {
  @Prop({ required: true })
  department: string;

  @Prop({ required: true })
  province: string;

  @Prop({ required: true })
  municipality: string;

  @Prop({ required: true })
  electoralSeat: string;

  @Prop({ required: true })
  electoralLocationName: string;

  @Prop({ required: true })
  district: string;

  @Prop({ required: true })
  zone: string;

  @Prop({ type: Object, required: true })
  circunscripcion: {
    number: number;
    type: string;
    name: string;
  };
}

@Schema({ _id: false })
export class PartyVote {
  @Prop({ required: true })
  partyId: string;

  @Prop({ required: true, min: 0 })
  votes: number;
}

@Schema({ _id: false })
export class Votes {
  @Prop({ required: true, min: 0 })
  validVotes: number;

  @Prop({ required: true, min: 0 })
  nullVotes: number;

  @Prop({ required: true, min: 0 })
  blankVotes: number;

  @Prop({ min: 0 })
  totalVotes?: number; // Calculado

  @Prop({ type: [PartyVote], required: true })
  partyVotes: PartyVote[];

  @Prop({ type: [PartyVote], required: true })
  diputiesVotes: PartyVote[];
}

@Schema({ _id: false })
export class Blockchain {
  @Prop()
  transactionHash?: string;

  @Prop()
  blockNumber?: number;

  @Prop()
  lastSyncDate?: Date;
}

@Schema({
  timestamps: true,
  collection: 'ballots',
})
export class Ballot {
  @Prop({ required: true, trim: true })
  tableNumber: string;

  @Prop({ required: true, unique: true, trim: true })
  tableCode: string;

  @Prop({ type: Types.ObjectId, ref: 'ElectoralLocation', required: true })
  electoralLocationId: Types.ObjectId;

  @Prop({ type: Location, required: true })
  location: Location;

  @Prop({ type: Votes, required: true })
  votes: Votes;

  @Prop({ type: Blockchain })
  blockchain?: Blockchain;

  // Campos IPFS
  @Prop({ required: true, trim: true })
  ipfsUri: string;

  @Prop({ required: false, trim: true })
  ipfsCid?: string;

  @Prop({
    default: 'pending',
    enum: ['pending', 'processed', 'synced', 'error'],
  })
  status: string;

  createdAt: Date;
  updatedAt: Date;
}

export const BallotSchema = SchemaFactory.createForClass(Ballot);

// Índices
BallotSchema.index({ tableCode: 1 }, { unique: true });
BallotSchema.index({ electoralLocationId: 1 });
BallotSchema.index({ status: 1 });
BallotSchema.index({ 'location.department': 1 });
BallotSchema.index({ 'location.province': 1 });
BallotSchema.index({ 'location.municipality': 1 });
BallotSchema.index({ 'location.circunscripcion.type': 1 });
BallotSchema.index({ 'blockchain.transactionHash': 1 });
BallotSchema.index({ ipfsCid: 1 });

// Middleware para calcular totalVotes antes de guardar
BallotSchema.pre('save', function (next) {
  if (this.votes) {
    this.votes.totalVotes =
      this.votes.validVotes + this.votes.nullVotes + this.votes.blankVotes;
  }
  next();
});
