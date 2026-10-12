import { roundQty } from '../common/utils/decimal';
import { InsufficientStockException, ProblemException } from '../common/errors/problem.exception';

const EPS = 0.0005;

/**
 * PUR-08 business rules for one return line, kept pure so they are unit-testable:
 *  - you cannot return more than was received on that inward line minus what earlier
 *    confirmed returns already sent back (409 RETURN_QTY_EXCEEDED);
 *  - you cannot return more than is physically on hand in that lot at the location the goods
 *    leave from (409 INSUFFICIENT_STOCK) - e.g. part of the lot has already been issued to a
 *    factory. StockService.post() enforces the same thing again at posting time (STK-06).
 */
export function assertReturnable(input: {
  label: string;
  received: number;
  alreadyReturned: number;
  onHand: number;
  requested: number;
  lotId?: string;
  locationId?: string;
}): void {
  const returnable = roundQty(Math.max(0, input.received - input.alreadyReturned));
  if (input.requested > returnable + EPS) {
    throw new ProblemException(
      'RETURN_QTY_EXCEEDED',
      409,
      `${input.label}: cannot return ${input.requested} - only ${returnable} is returnable (received ${input.received}, already returned ${input.alreadyReturned}).`,
      undefined,
      {
        received: input.received,
        alreadyReturned: input.alreadyReturned,
        returnable,
        requested: input.requested,
      },
    );
  }
  if (input.requested > input.onHand + EPS) {
    throw new InsufficientStockException(
      `${input.label}: cannot return ${input.requested} - only ${roundQty(input.onHand)} of this lot is on hand at the return location.`,
      {
        lotId: input.lotId,
        locationId: input.locationId,
        onHand: roundQty(input.onHand),
        requested: input.requested,
      },
    );
  }
}
