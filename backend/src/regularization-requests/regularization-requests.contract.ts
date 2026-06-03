import { UserRole } from '../common/constants/roles.enum';
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';
import { ReviewRegularizationRequestDto } from './dto/review-regularization-request.dto';
import { UpdateRegularizationStatusDto } from './dto/update-regularization-status.dto';
import type {
  RegularizationRequestView,
  RegularizationTaskOption,
} from './regularization-requests.service';

/** Public API used by RegularizationRequestsController */
export interface RegularizationRequestsContract {
  listTaskOptions(designerId: string): Promise<RegularizationTaskOption[]>;
  findByDesigner(designerId: string): Promise<RegularizationRequestView[]>;
  findOne(id: string, userId: string, role: UserRole): Promise<RegularizationRequestView>;
  findPendingApprovals(managerId: string, role: UserRole): Promise<RegularizationRequestView[]>;
  findTeamRequests(
    managerId: string,
    role: UserRole,
    filters: { status?: string; designerId?: string },
  ): Promise<RegularizationRequestView[]>;
  create(
    submitterId: string,
    role: UserRole,
    dto: CreateRegularizationRequestDto,
  ): Promise<RegularizationRequestView>;
  review(
    id: string,
    reviewerId: string,
    role: UserRole,
    dto: ReviewRegularizationRequestDto,
  ): Promise<RegularizationRequestView>;
  updateStatus(
    id: string,
    dto: UpdateRegularizationStatusDto,
    reviewerId?: string,
    role?: UserRole,
  ): Promise<RegularizationRequestView>;
}
